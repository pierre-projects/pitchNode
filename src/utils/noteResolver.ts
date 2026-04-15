export interface NoteInfo {
  note: string       // e.g. "E4"
  noteName: string   // e.g. "E"
  octave: number     // e.g. 4
  targetFreq: number // e.g. 329.63
  centsOff: number   // -50 to +50; negative = flat, positive = sharp
  midiNote: number   // e.g. 64
}

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B"
] as const

export function resolveNote(freq: number): NoteInfo | null {
  if (!freq || !isFinite(freq) || freq <= 0) return null

  // Raw MIDI note number (floating point)
  const rawMidi = 12 * Math.log2(freq / 440) + 69

  // Round to nearest semitone
  const midiNote = Math.round(rawMidi)

  // Guard: valid MIDI range
  if (midiNote < 0 || midiNote > 127) return null

  // Cents deviation: negative = flat, positive = sharp
  const centsOff = (rawMidi - midiNote) * 100

  // Safe modulo for note name index (handles negative values)
  const noteIndex = ((midiNote % 12) + 12) % 12
  const noteName = NOTE_NAMES[noteIndex]
  const octave = Math.floor(midiNote / 12) - 1

  // Target frequency of the nearest perfect semitone
  const targetFreq = 440 * Math.pow(2, (midiNote - 69) / 12)

  return {
    note: `${noteName}${octave}`,
    noteName,
    octave,
    targetFreq,
    centsOff,
    midiNote
  }
}
