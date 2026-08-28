import { resolveNote, type NoteInfo } from "./noteResolver"

export interface TrackedPitch {
  frequency: number
  noteInfo: NoteInfo
}

export interface PitchTrackerOptions {
  confirmationFrames?: number
  candidateWindowMs?: number
  holdDurationMs?: number
  smoothingAlpha?: number
}

const DEFAULT_CONFIRMATION_FRAMES = 2
const DEFAULT_CANDIDATE_WINDOW_MS = 120
const DEFAULT_HOLD_DURATION_MS = 750
const DEFAULT_SMOOTHING_ALPHA = 0.5

interface CandidatePitch {
  midiNote: number
  count: number
  logFrequencySum: number
  lastSeenAt: number
}

export class PitchTracker {
  private readonly confirmationFrames: number
  private readonly candidateWindowMs: number
  private readonly holdDurationMs: number
  private readonly smoothingAlpha: number

  private current: TrackedPitch | null = null
  private candidate: CandidatePitch | null = null
  private lastAcceptedAt: number | null = null

  constructor({
    confirmationFrames = DEFAULT_CONFIRMATION_FRAMES,
    candidateWindowMs = DEFAULT_CANDIDATE_WINDOW_MS,
    holdDurationMs = DEFAULT_HOLD_DURATION_MS,
    smoothingAlpha = DEFAULT_SMOOTHING_ALPHA
  }: PitchTrackerOptions = {}) {
    if (!Number.isInteger(confirmationFrames) || confirmationFrames < 1) {
      throw new RangeError("confirmationFrames must be a positive integer")
    }
    if (!Number.isFinite(candidateWindowMs) || candidateWindowMs <= 0) {
      throw new RangeError("candidateWindowMs must be positive")
    }
    if (!Number.isFinite(holdDurationMs) || holdDurationMs < 0) {
      throw new RangeError("holdDurationMs cannot be negative")
    }
    if (
      !Number.isFinite(smoothingAlpha) ||
      smoothingAlpha <= 0 ||
      smoothingAlpha > 1
    ) {
      throw new RangeError(
        "smoothingAlpha must be greater than 0 and at most 1"
      )
    }

    this.confirmationFrames = confirmationFrames
    this.candidateWindowMs = candidateWindowMs
    this.holdDurationMs = holdDurationMs
    this.smoothingAlpha = smoothingAlpha
  }

  process(frequency: number | null, timestampMs: number): TrackedPitch | null {
    this.expireOldState(timestampMs)

    const noteInfo = frequency === null ? null : resolveNote(frequency)
    if (noteInfo === null) return this.current

    if (this.current?.noteInfo.midiNote === noteInfo.midiNote) {
      this.candidate = null

      const smoothedFrequency = Math.exp(
        this.smoothingAlpha * Math.log(frequency) +
          (1 - this.smoothingAlpha) * Math.log(this.current.frequency)
      )
      const smoothedNoteInfo = resolveNote(smoothedFrequency)

      if (smoothedNoteInfo === null) return this.current

      this.current = {
        frequency: smoothedFrequency,
        noteInfo: smoothedNoteInfo
      }
      this.lastAcceptedAt = timestampMs
      return this.current
    }

    if (
      this.candidate?.midiNote === noteInfo.midiNote &&
      timestampMs - this.candidate.lastSeenAt <= this.candidateWindowMs
    ) {
      this.candidate.count++
      this.candidate.logFrequencySum += Math.log(frequency)
      this.candidate.lastSeenAt = timestampMs
    } else {
      this.candidate = {
        midiNote: noteInfo.midiNote,
        count: 1,
        logFrequencySum: Math.log(frequency),
        lastSeenAt: timestampMs
      }
    }

    if (this.candidate.count < this.confirmationFrames) return this.current

    const confirmedFrequency = Math.exp(
      this.candidate.logFrequencySum / this.candidate.count
    )
    const confirmedNoteInfo = resolveNote(confirmedFrequency)

    this.candidate = null
    if (confirmedNoteInfo === null) return this.current

    this.current = {
      frequency: confirmedFrequency,
      noteInfo: confirmedNoteInfo
    }
    this.lastAcceptedAt = timestampMs
    return this.current
  }

  reset(): void {
    this.current = null
    this.candidate = null
    this.lastAcceptedAt = null
  }

  private expireOldState(timestampMs: number): void {
    if (
      this.candidate !== null &&
      timestampMs - this.candidate.lastSeenAt > this.candidateWindowMs
    ) {
      this.candidate = null
    }

    if (
      this.current !== null &&
      this.lastAcceptedAt !== null &&
      timestampMs - this.lastAcceptedAt >= this.holdDurationMs
    ) {
      this.current = null
      this.lastAcceptedAt = null
    }
  }
}
