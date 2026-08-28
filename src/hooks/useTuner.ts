import { useCallback, useEffect, useRef, useState } from "react"

import type { NoteInfo } from "~src/utils/noteResolver"
import {
  createYinDetector,
  DEFAULT_ANALYSIS_SIZE,
  type YinPitchDetector
} from "~src/utils/pitchDetector"
import { PitchTracker, type TrackedPitch } from "~src/utils/pitchTracker"

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

// Keep a larger rolling AnalyserNode buffer, then analyze its newest 2048 samples.
const BUFFER_SIZE = 4096
const NOISE_GATE_RMS = 0.001
const HIGH_PASS_FREQUENCY = 30

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
  const [selectedInputId, setSelectedInputIdState] = useState<string | null>(
    loadStoredDeviceId
  )

  // Refs for audio resources
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const highPassRef = useRef<BiquadFilterNode | null>(null)
  const detectorRef = useRef<YinPitchDetector | null>(null)
  const trackerRef = useRef<PitchTracker | null>(null)
  const publishedReadingRef = useRef<TrackedPitch | null>(null)

  // Refs used to avoid stale closures in callbacks / RAF loop
  const stopTuningRef = useRef<() => void>(() => {})
  const startTuningCoreRef = useRef<(deviceId: string | null) => Promise<void>>(
    async () => {}
  )
  const statusRef = useRef<TunerStatus>("idle")
  const selectedInputIdRef = useRef<string | null>(selectedInputId)

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
    highPassRef.current = null
    detectorRef.current = null
    trackerRef.current?.reset()
    trackerRef.current = null
    publishedReadingRef.current = null
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

        detectorRef.current = createYinDetector({ sampleRate })
        trackerRef.current = new PitchTracker()
        publishedReadingRef.current = null

        const source = audioContext.createMediaStreamSource(stream)
        const highPass = audioContext.createBiquadFilter()
        highPass.type = "highpass"
        highPass.frequency.value = HIGH_PASS_FREQUENCY
        highPass.Q.value = Math.SQRT1_2
        highPassRef.current = highPass

        const analyser = audioContext.createAnalyser()
        analyser.fftSize = BUFFER_SIZE
        analyser.smoothingTimeConstant = 0
        source.connect(highPass)
        highPass.connect(analyser)
        analyserRef.current = analyser

        const buffer = new Float32Array(BUFFER_SIZE)

        setStatus("listening")
        statusRef.current = "listening"
        setErrorMessage(null)

        // Now that permission is granted, refresh to get labelled device names
        await refreshInputs()

        const detect = () => {
          if (
            !analyserRef.current ||
            !detectorRef.current ||
            !trackerRef.current
          )
            return

          analyserRef.current.getFloatTimeDomainData(buffer)

          // Measure the same newest samples that are passed to YIN. The gate is
          // intentionally absolute, so a previous loud note cannot raise it.
          let sumSq = 0
          const analysisStart = buffer.length - DEFAULT_ANALYSIS_SIZE
          for (let i = analysisStart; i < buffer.length; i++) {
            sumSq += buffer[i] * buffer[i]
          }
          const rms = Math.sqrt(sumSq / DEFAULT_ANALYSIS_SIZE)
          const pitch =
            rms >= NOISE_GATE_RMS
              ? detectorRef.current.detect(buffer)?.frequency ?? null
              : null
          const reading = trackerRef.current.process(pitch, performance.now())

          // Pending candidates and held readings retain their object identity,
          // avoiding redundant React updates while the tracker waits or holds.
          if (reading !== publishedReadingRef.current) {
            publishedReadingRef.current = reading
            setFrequency(reading?.frequency ?? null)
            setNoteInfo(reading?.noteInfo ?? null)
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
