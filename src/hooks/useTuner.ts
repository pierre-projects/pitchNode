import { useCallback, useEffect, useRef, useState } from "react"

import { YIN } from "pitchfinder"

import { resolveNote, type NoteInfo } from "~src/utils/noteResolver"

export type TunerStatus = "idle" | "listening" | "error"

export interface AudioInputDevice {
  deviceId: string
  label: string // may be "" before microphone permission is granted
}

export interface TunerState {
  status: TunerStatus
  noteInfo: NoteInfo | null
  frequency: number | null
  errorMessage: string | null
  availableInputs: AudioInputDevice[]
  selectedInputId: string | null
}

export interface TunerControls {
  startTuning: () => Promise<void>
  stopTuning: () => void
  setSelectedInputId: (deviceId: string | null) => void
  refreshInputs: () => Promise<void>
}

// 4096 → YIN uses bufferSize=2048, yinBufferLength=1024
// min detectable freq = sampleRate / 1024 ≈ 43 Hz (covers drop A and below)
const BUFFER_SIZE = 4096
const NOISE_GATE_RMS = 0.001  // very low — rely on YIN + range filter for quality
const HOLD_DURATION_MS = 3000 // keep last reading visible after signal fades
const SMOOTHING_ALPHA = 0.5   // higher = faster convergence to new frequency (~5 frames)
const MIN_FREQ = 40           // below drop-A tuning
const MAX_FREQ = 2000         // above practical guitar range

const STORAGE_KEY = "pitchnode_inputDeviceId"

function loadStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function saveDeviceId(deviceId: string | null): void {
  try {
    if (deviceId) localStorage.setItem(STORAGE_KEY, deviceId)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage unavailable — skip persistence silently
  }
}

export function useTuner(): TunerState & TunerControls {
  const [status, setStatus] = useState<TunerStatus>("idle")
  const [noteInfo, setNoteInfo] = useState<NoteInfo | null>(null)
  const [frequency, setFrequency] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [availableInputs, setAvailableInputs] = useState<AudioInputDevice[]>([])
  const [selectedInputId, setSelectedInputIdState] = useState<string | null>(loadStoredDeviceId)

  // Refs for audio resources
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const detectorRef = useRef<((buf: Float32Array) => number | null) | null>(null)

  // Refs used to avoid stale closures in callbacks / RAF loop
  const stopTuningRef = useRef<() => void>(() => {})
  const startTuningCoreRef = useRef<(deviceId: string | null) => Promise<void>>(async () => {})
  const statusRef = useRef<TunerStatus>("idle")
  const selectedInputIdRef = useRef<string | null>(selectedInputId)

  // EMA + hold state — kept in refs to avoid stale closure issues in RAF loop
  const smoothedFreqRef = useRef<number | null>(null)
  const lastValidTimeRef = useRef<number>(0)

  // Keep refs in sync with state
  statusRef.current = status
  selectedInputIdRef.current = selectedInputId

  const stopTuning = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    detectorRef.current = null
    smoothedFreqRef.current = null
    lastValidTimeRef.current = 0
    setStatus("idle")
    setNoteInfo(null)
    setFrequency(null)
    setErrorMessage(null)
  }, [])

  stopTuningRef.current = stopTuning

  const refreshInputs = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs = devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label }))
    setAvailableInputs(inputs)

    // If stored device is no longer available, fall back to system default
    setSelectedInputIdState((prev) => {
      if (prev && !inputs.some((d) => d.deviceId === prev)) {
        saveDeviceId(null)
        return null
      }
      return prev
    })
  }, [])

  // Core tuning start — accepts an explicit deviceId to avoid stale closures
  const startTuningCore = useCallback(
    async (deviceId: string | null) => {
      if (statusRef.current === "listening") return

      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream

        const audioContext = new AudioContext()
        audioContextRef.current = audioContext

        const { sampleRate } = audioContext

        detectorRef.current = YIN({ sampleRate, threshold: 0.15 })

        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = BUFFER_SIZE
        analyser.smoothingTimeConstant = 0
        source.connect(analyser)
        analyserRef.current = analyser

        const buffer = new Float32Array(BUFFER_SIZE)

        setStatus("listening")
        statusRef.current = "listening"
        setErrorMessage(null)

        // Now that permission is granted, refresh to get labelled device names
        await refreshInputs()

        const detect = () => {
          if (!analyserRef.current || !detectorRef.current) return

          analyserRef.current.getFloatTimeDomainData(buffer)

          // RMS energy of the frame
          let sumSq = 0
          for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i]
          const rms = Math.sqrt(sumSq / buffer.length)

          if (rms >= NOISE_GATE_RMS) {
            // Signal is present — extend the hold timer regardless of YIN result.
            // YIN often returns null on attack transients or complex overtone frames
            // even while the string is clearly audible; we must not let the hold
            // timer count from the last successful detection in those cases.
            lastValidTimeRef.current = performance.now()

            const pitch = detectorRef.current(buffer)

            if (pitch !== null && pitch >= MIN_FREQ && pitch <= MAX_FREQ) {
              // EMA smoothing — snap on first detection or large jumps (re-strike)
              if (smoothedFreqRef.current === null) {
                smoothedFreqRef.current = pitch
              } else {
                const ratio = pitch / smoothedFreqRef.current
                if (ratio > 0.8 && ratio < 1.25) {
                  // Same general note — smooth it
                  smoothedFreqRef.current =
                    SMOOTHING_ALPHA * pitch +
                    (1 - SMOOTHING_ALPHA) * smoothedFreqRef.current
                } else {
                  // Large jump (new string struck) — snap immediately
                  smoothedFreqRef.current = pitch
                }
              }

              setFrequency(smoothedFreqRef.current)
              setNoteInfo(resolveNote(smoothedFreqRef.current))
            }
            // YIN returned null — keep previous state, don't flicker
          } else {
            // Below noise gate — hold for HOLD_DURATION_MS, then clear
            if (performance.now() - lastValidTimeRef.current >= HOLD_DURATION_MS) {
              smoothedFreqRef.current = null
              setNoteInfo(null)
              setFrequency(null)
            }
          }

          rafRef.current = requestAnimationFrame(detect)
        }

        rafRef.current = requestAnimationFrame(detect)
      } catch (err: unknown) {
        stopTuningRef.current()
        setStatus("error")
        statusRef.current = "error"
        if (err instanceof DOMException) {
          if (err.name === "NotAllowedError") {
            setErrorMessage(
              "Microphone access denied. Allow microphone access in Chrome settings."
            )
          } else if (err.name === "NotFoundError") {
            setErrorMessage(
              "No microphone found. Connect a microphone and try again."
            )
          } else {
            setErrorMessage(`Audio error: ${err.message}`)
          }
        } else {
          setErrorMessage("An unexpected error occurred.")
        }
      }
    },
    [refreshInputs, stopTuning]
  )

  // Keep ref fresh so setSelectedInputId can call it without a stale closure
  startTuningCoreRef.current = startTuningCore

  const startTuning = useCallback(async () => {
    await startTuningCore(selectedInputIdRef.current)
  }, [startTuningCore])

  const setSelectedInputId = useCallback((deviceId: string | null) => {
    saveDeviceId(deviceId)
    setSelectedInputIdState(deviceId)
    selectedInputIdRef.current = deviceId

    // If tuner is active, restart with the new device
    if (statusRef.current === "listening") {
      stopTuningRef.current()
      setTimeout(() => startTuningCoreRef.current(deviceId), 0)
    }
  }, [])

  // Cleanup on unmount (popup closed mid-session)
  useEffect(() => {
    return () => {
      stopTuningRef.current()
    }
  }, [])

  return {
    status,
    noteInfo,
    frequency,
    errorMessage,
    availableInputs,
    selectedInputId,
    startTuning,
    stopTuning,
    setSelectedInputId,
    refreshInputs
  }
}
