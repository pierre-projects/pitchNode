export interface PitchDetection {
  frequency: number
  clarity: number
}

export interface YinDetectorOptions {
  sampleRate: number
  analysisSize?: number
  minFrequency?: number
  maxFrequency?: number
  threshold?: number
}

export interface YinPitchDetector {
  detect: (buffer: Float32Array) => PitchDetection | null
}

export const DEFAULT_ANALYSIS_SIZE = 2048
export const MIN_TUNER_FREQUENCY = 50
export const MAX_TUNER_FREQUENCY = 2000

const DEFAULT_THRESHOLD = 0.15

/**
 * Creates a state-free YIN pitch detector with reusable scratch storage.
 *
 * The difference function is normalized before the first candidate is
 * inspected, so pitch acceptance does not depend on the signal amplitude.
 * Frequency bounds are applied to the period search itself; an out-of-range
 * short period cannot hide a valid in-range fundamental.
 */
export function createYinDetector({
  sampleRate,
  analysisSize = DEFAULT_ANALYSIS_SIZE,
  minFrequency = MIN_TUNER_FREQUENCY,
  maxFrequency = MAX_TUNER_FREQUENCY,
  threshold = DEFAULT_THRESHOLD
}: YinDetectorOptions): YinPitchDetector {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive finite number")
  }
  if (
    !Number.isInteger(analysisSize) ||
    analysisSize < 8 ||
    analysisSize % 2 !== 0
  ) {
    throw new RangeError(
      "analysisSize must be an even integer of at least 8 samples"
    )
  }
  if (
    !Number.isFinite(minFrequency) ||
    !Number.isFinite(maxFrequency) ||
    minFrequency <= 0 ||
    maxFrequency <= minFrequency ||
    maxFrequency >= sampleRate / 2
  ) {
    throw new RangeError(
      "frequency bounds must be positive, ordered, and below Nyquist"
    )
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new RangeError("threshold must be between 0 and 1")
  }

  const differenceLength = analysisSize / 2
  const minPeriod = Math.max(2, Math.floor(sampleRate / maxFrequency))
  const maxPeriod = Math.min(
    differenceLength - 2,
    Math.ceil(sampleRate / minFrequency)
  )

  if (minPeriod > maxPeriod) {
    throw new RangeError(
      "analysisSize is too small for the requested frequency range"
    )
  }

  // Reused on every call to avoid allocating inside the animation loop.
  const difference = new Float32Array(differenceLength)

  const detect = (buffer: Float32Array): PitchDetection | null => {
    if (buffer.length < analysisSize) return null

    // Analyze the newest samples returned by AnalyserNode rather than the
    // oldest half of its rolling time-domain buffer.
    const offset = buffer.length - analysisSize

    difference[0] = 0
    for (let period = 1; period < differenceLength; period++) {
      let sum = 0
      for (let index = 0; index < differenceLength; index++) {
        const delta = buffer[offset + index] - buffer[offset + index + period]
        sum += delta * delta
      }
      difference[period] = sum
    }

    // Cumulative mean normalized difference (YIN step 3). Do not seed the
    // running sum with a fixed value: doing so makes low-amplitude signals
    // collapse toward tiny periods and produces ultrasonic false pitches.
    difference[0] = 1
    let runningSum = 0
    for (let period = 1; period < differenceLength; period++) {
      runningSum += difference[period]
      difference[period] =
        runningSum === 0 ? 1 : (difference[period] * period) / runningSum
    }

    let period = minPeriod
    for (; period <= maxPeriod; period++) {
      if (difference[period] < threshold) {
        while (
          period + 1 <= maxPeriod &&
          difference[period + 1] < difference[period]
        ) {
          period++
        }
        break
      }
    }

    if (period > maxPeriod) return null

    const previous = difference[period - 1]
    const current = difference[period]
    const next = difference[period + 1]
    const denominator = 2 * (2 * current - next - previous)
    const adjustment = denominator === 0 ? 0 : (next - previous) / denominator
    const refinedPeriod = period + Math.max(-1, Math.min(1, adjustment))
    const frequency = sampleRate / refinedPeriod

    if (
      !Number.isFinite(frequency) ||
      frequency < minFrequency ||
      frequency > maxFrequency
    ) {
      return null
    }

    return {
      frequency,
      clarity: Math.max(0, Math.min(1, 1 - current))
    }
  }

  return { detect }
}
