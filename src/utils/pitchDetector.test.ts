import { describe, expect, it } from "vitest"

import { resolveNote } from "./noteResolver"
import { createYinDetector } from "./pitchDetector"

const BUFFER_SIZE = 4096
const GUITAR_NOTES = [
  ["A1", 55],
  ["E2", 82.4069],
  ["A2", 110],
  ["D3", 146.8324],
  ["G3", 195.9977],
  ["B3", 246.9417],
  ["E4", 329.6276]
] as const

function sineBuffer(
  frequency: number,
  amplitude: number,
  sampleRate: number,
  dcOffset = 0
): Float32Array {
  const buffer = new Float32Array(BUFFER_SIZE)
  for (let index = 0; index < buffer.length; index++) {
    buffer[index] =
      dcOffset +
      amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate)
  }
  return buffer
}

function harmonicBuffer(
  frequency: number,
  amplitude: number,
  sampleRate: number,
  noiseRatio = 0
): Float32Array {
  const buffer = new Float32Array(BUFFER_SIZE)
  let seed = 0x12345678

  for (let index = 0; index < buffer.length; index++) {
    let value = 0
    for (let harmonic = 1; harmonic <= 6; harmonic++) {
      value +=
        Math.sin((2 * Math.PI * frequency * harmonic * index) / sampleRate) /
        harmonic
    }

    seed = (1664525 * seed + 1013904223) >>> 0
    const noise = (seed / 0x100000000) * 2 - 1
    buffer[index] = amplitude * (value / 1.8 + noise * noiseRatio)
  }

  return buffer
}

function centsBetween(actual: number, expected: number): number {
  return 1200 * Math.log2(actual / expected)
}

describe.each([44100, 48000])("YIN detector at %i Hz", (sampleRate) => {
  const detector = createYinDetector({ sampleRate })

  it.each(GUITAR_NOTES)(
    "detects quiet and loud %s without amplitude bias",
    (_, frequency) => {
      const quiet = detector.detect(sineBuffer(frequency, 0.002, sampleRate))
      const loud = detector.detect(sineBuffer(frequency, 0.2, sampleRate))

      expect(quiet).not.toBeNull()
      expect(loud).not.toBeNull()
      expect(Math.abs(centsBetween(quiet!.frequency, frequency))).toBeLessThan(
        1
      )
      expect(Math.abs(centsBetween(loud!.frequency, frequency))).toBeLessThan(1)
      expect(
        Math.abs(centsBetween(quiet!.frequency, loud!.frequency))
      ).toBeLessThan(0.1)
    }
  )

  it("detects harmonic-rich room-level guitar signals without octave errors", () => {
    for (const [note, frequency] of GUITAR_NOTES) {
      const detection = detector.detect(
        harmonicBuffer(frequency, 0.003, sampleRate, 0.12)
      )

      expect(detection, note).not.toBeNull()
      expect(resolveNote(detection!.frequency)?.note, note).toBe(note)
      expect(
        Math.abs(centsBetween(detection!.frequency, frequency)),
        note
      ).toBeLessThan(20)
    }
  })
})

describe("YIN detector frame handling", () => {
  const sampleRate = 48000
  const detector = createYinDetector({ sampleRate })

  it("uses the newest 2048 samples", () => {
    const buffer = sineBuffer(110, 0.2, sampleRate)
    const newNote = sineBuffer(146.8324, 0.01, sampleRate)
    buffer.set(newNote.subarray(BUFFER_SIZE / 2), BUFFER_SIZE / 2)

    const detection = detector.detect(buffer)

    expect(detection).not.toBeNull()
    expect(resolveNote(detection!.frequency)?.note).toBe("D3")
  })

  it("recognizes a follow-up note 20 dB quieter than the prior note", () => {
    const loudOldNote = detector.detect(sineBuffer(110, 0.2, sampleRate))
    const quietNewNote = detector.detect(sineBuffer(146.8324, 0.02, sampleRate))

    expect(resolveNote(loudOldNote!.frequency)?.note).toBe("A2")
    expect(resolveNote(quietNewNote!.frequency)?.note).toBe("D3")
  })

  it("ignores silence, DC, and isolated attack impulses", () => {
    const impulse = new Float32Array(BUFFER_SIZE)
    impulse[BUFFER_SIZE - 512] = 0.5

    expect(detector.detect(new Float32Array(BUFFER_SIZE))).toBeNull()
    expect(detector.detect(new Float32Array(BUFFER_SIZE).fill(0.25))).toBeNull()
    expect(detector.detect(impulse)).toBeNull()
  })

  it("is unaffected by a DC offset on a pitched signal", () => {
    const detection = detector.detect(sineBuffer(110, 0.003, sampleRate, 0.2))

    expect(detection).not.toBeNull()
    expect(Math.abs(centsBetween(detection!.frequency, 110))).toBeLessThan(1)
  })

  it("returns null for buffers shorter than the analysis window", () => {
    expect(detector.detect(new Float32Array(1024))).toBeNull()
  })
})
