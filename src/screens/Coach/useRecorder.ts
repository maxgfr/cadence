import { useCallback, useEffect, useRef, useState } from 'react'
import { type Recorder, startRecorder } from '../../app/voice.ts'

/** The microphone, one recording at a time: start, then stop (to send it) or cancel. */
export function useRecorder(onError: (e: unknown) => void) {
  const [recording, setRecording] = useState(false)
  const rec = useRef<Recorder | null>(null)
  useEffect(() => () => rec.current?.cancel(), [])
  const start = useCallback(async () => {
    try {
      rec.current = await startRecorder()
      setRecording(true)
    } catch (e) {
      onError(e)
    }
  }, [onError])
  const stop = useCallback(async (): Promise<Blob | undefined> => {
    const r = rec.current
    rec.current = null
    setRecording(false)
    return r ? r.stop() : undefined
  }, [])
  const cancel = useCallback(() => {
    rec.current?.cancel()
    rec.current = null
    setRecording(false)
  }, [])
  return { recording, start, stop, cancel }
}
