import { providerKindOf, resolveCapabilities, transcribe, transcriptionProblem } from 'llm-connect'
import { decodeAudio, SPEECH_SAMPLE_RATE } from 'llm-connect/nemo'
import { type ModelRef, toLlmSettings } from '../core/ai/client.ts'
import type { CoachInput } from '../core/ai/coach.ts'
import { encodeWav } from '../core/ai/wav.ts'
import type { Locale } from '../core/i18n/locale.ts'
import type { WorkerReply, WorkerRequest } from './transcribe.worker.ts'

/** Why a voice note cannot be used, for a message the athlete can act on. */
export class VoiceError extends Error {
  constructor(readonly code: 'unsupported' | 'denied' | 'no-transcription' | 'device-failed') {
    super(code)
  }
}

export const canRecord = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== 'undefined'

export interface Recorder {
  /** Stops and returns the recording. */
  stop(): Promise<Blob>
  cancel(): void
}

/** Starts recording from the microphone (the browser asks for permission the first time). */
export async function startRecorder(): Promise<Recorder> {
  if (!canRecord()) throw new VoiceError('unsupported')
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch {
    throw new VoiceError('denied')
  }
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  })
  recorder.start()
  const release = () => {
    for (const track of stream.getTracks()) track.stop()
  }
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.addEventListener(
          'stop',
          () => {
            release()
            resolve(new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' }))
          },
          { once: true },
        )
        recorder.stop()
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
  }
}

/** Whether the configured model hears a recording itself, without a transcription first. */
export function hearsAudio(ref: ModelRef): boolean {
  const settings = toLlmSettings(ref)
  const listed = ref.provider.models.find((m) => m.id === ref.modelId)
  return resolveCapabilities({
    kind: providerKindOf(settings),
    modelId: ref.modelId,
    catalog: { input: listed?.audio ? ['text', 'audio'] : ['text'] },
  }).audio
}

/** Whether voice notes can be used with these settings at all. */
export function voiceAvailable(ref: ModelRef, voice: 'provider' | 'device' | undefined): boolean {
  if (hearsAudio(ref) || voice === 'device') return true
  return transcriptionProblem(toLlmSettings(ref)) === null
}

let worker: Worker | undefined

/** Speech to text in a worker on the device (the model is downloaded on first use: `onProgress` follows it). */
export function transcribeOnDevice(
  blob: Blob,
  language: Locale,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  return decodeAudio(blob).then(
    (samples) =>
      new Promise<string>((resolve, reject) => {
        worker ??= new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' })
        const w = worker
        const onMessage = (e: MessageEvent<WorkerReply>) => {
          if (e.data.type === 'progress') onProgress?.(e.data.ratio)
          else {
            w.removeEventListener('message', onMessage)
            if (e.data.type === 'done') resolve(e.data.text)
            else reject(new VoiceError('device-failed'))
          }
        }
        w.addEventListener('message', onMessage)
        const req: WorkerRequest = { samples, language }
        w.postMessage(req, [samples.buffer])
      }),
  )
}

/**
 * A recording as the coach takes it: the audio itself when the model hears (as WAV for OpenAI-compatible APIs, which
 * hear WAV or MP3 only), else its words, from the device's model or the provider's transcription.
 */
export async function voiceInput(
  blob: Blob,
  ref: ModelRef,
  voice: 'provider' | 'device' | undefined,
  language: Locale,
  onProgress?: (ratio: number) => void,
): Promise<CoachInput> {
  if (hearsAudio(ref)) {
    const settings = toLlmSettings(ref)
    if (providerKindOf(settings) === 'google')
      return { audio: { data: new Uint8Array(await blob.arrayBuffer()), mediaType: blob.type || 'audio/webm' } }
    const samples = await decodeAudio(blob)
    return { audio: { data: encodeWav(samples, SPEECH_SAMPLE_RATE), mediaType: 'audio/wav' } }
  }
  if (voice === 'device') return { text: await transcribeOnDevice(blob, language, onProgress) }
  const settings = toLlmSettings(ref)
  if (transcriptionProblem(settings)) throw new VoiceError('no-transcription')
  const t = await transcribe(settings, blob, { language })
  return { text: t.text }
}
