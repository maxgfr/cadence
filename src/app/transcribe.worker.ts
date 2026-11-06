/// <reference lib="webworker" />
import { loadNemo, type NemoTranscriber, type OrtRuntime } from 'llm-connect/nemo'
import * as ort from 'onnxruntime-web'

/**
 * Speech to text on the device: NVIDIA Canary (English, French, German), downloaded once into the browser's cache,
 * then run here, off the page's thread. Nothing leaves the device. onnxruntime is bundled with this worker (its
 * WebAssembly is one of the app's files), so it works offline once the model is cached.
 */
export type WorkerRequest = { samples: Float32Array; language: string }
export type WorkerReply =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string }

let model: Promise<NemoTranscriber> | undefined

const post = (m: WorkerReply) => postMessage(m)

addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  try {
    model ??= loadNemo({
      model: 'canary',
      runtime: ort as unknown as OrtRuntime,
      onProgress: (p) => post({ type: 'progress', ratio: p.ratio }),
    })
    const nemo = await model
    const t = await nemo.transcribe(e.data.samples, { language: e.data.language })
    post({ type: 'done', text: t.text })
  } catch (err) {
    model = undefined
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
