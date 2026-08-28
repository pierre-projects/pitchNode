import { describe, expect, it } from "vitest"

import { PitchTracker } from "./pitchTracker"

describe("PitchTracker", () => {
  it("confirms initial and changed notes after two matching frames", () => {
    const tracker = new PitchTracker()

    expect(tracker.process(110, 0)).toBeNull()
    const initial = tracker.process(110, 16)
    expect(initial?.noteInfo.note).toBe("A2")

    expect(tracker.process(146.8324, 32)).toBe(initial)
    const changed = tracker.process(146.8324, 48)
    expect(changed?.noteInfo.note).toBe("D3")
    expect(changed?.frequency).toBeCloseTo(146.8324, 3)
  })

  it("does not switch for an isolated wrong-note frame", () => {
    const tracker = new PitchTracker()
    tracker.process(110, 0)
    const initial = tracker.process(110, 16)

    expect(tracker.process(146.8324, 32)).toBe(initial)
    expect(tracker.process(110, 48)?.noteInfo.note).toBe("A2")
  })

  it("requires candidate frames to arrive within 120 ms", () => {
    const tracker = new PitchTracker()

    expect(tracker.process(110, 0)).toBeNull()
    expect(tracker.process(110, 121)).toBeNull()
    expect(tracker.process(110, 137)?.noteInfo.note).toBe("A2")
  })

  it("smooths within a note in log-frequency space", () => {
    const tracker = new PitchTracker()
    tracker.process(440, 0)
    tracker.process(440, 16)

    const reading = tracker.process(445, 32)
    expect(reading?.noteInfo.note).toBe("A4")
    expect(reading?.frequency).toBeCloseTo(Math.sqrt(440 * 445), 8)
  })

  it("does not blend a confirmed new note with the old frequency", () => {
    const tracker = new PitchTracker()
    tracker.process(110, 0)
    tracker.process(110, 16)
    tracker.process(146, 32)

    const reading = tracker.process(147, 48)
    expect(reading?.noteInfo.note).toBe("D3")
    expect(reading?.frequency).toBeCloseTo(Math.sqrt(146 * 147), 8)
  })

  it("prevents one-frame flicker around a semitone boundary", () => {
    const tracker = new PitchTracker()
    const boundary = Math.sqrt(440 * 466.1637615)
    tracker.process(440, 0)
    tracker.process(440, 16)

    for (let index = 0; index < 8; index++) {
      const frequency = boundary * (index % 2 === 0 ? 1.001 : 0.999)
      expect(tracker.process(frequency, 32 + index * 16)?.noteInfo.note).toBe(
        "A4"
      )
    }
  })

  it("clears 750 ms after the last accepted pitch", () => {
    const tracker = new PitchTracker()
    tracker.process(110, 0)
    const reading = tracker.process(110, 16)

    expect(tracker.process(null, 200)).toBe(reading)
    expect(tracker.process(null, 500)).toBe(reading)
    expect(tracker.process(null, 765)).toBe(reading)
    expect(tracker.process(null, 766)).toBeNull()
  })

  it("reset clears held and pending state", () => {
    const tracker = new PitchTracker()
    tracker.process(110, 0)
    tracker.process(110, 16)
    tracker.reset()

    expect(tracker.process(null, 32)).toBeNull()
    expect(tracker.process(110, 48)).toBeNull()
  })
})
