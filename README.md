# Pitchnode

Pitchnode is a real-time chromatic tuner for Chrome, built with Plasmo, React, and TypeScript. It analyzes a live microphone or audio-interface input, resolves the nearest musical note, and shows whether the signal is flat, sharp, or in tune.

The extension currently ships with two entry points:

- `popup.tsx` for the compact popup tuner
- `sidepanel.tsx` for the full-height side panel tuner

## Features

- Real-time chromatic tuning using microphone input
- Consistent pitch detection across quiet and loud notes
- Balanced two-frame note confirmation to reject brief incorrect readings
- Live frequency readout in Hz
- Nearest-note detection with cents offset
- Visual flat / sharp / in-tune meter
- Room-rumble filtering for microphone input
- Audio input selection when multiple microphones are available
- Persisted preferred input device between sessions
- Popup and side panel UIs powered by the same tuner component

## Tech Stack

- Plasmo
- React 18
- TypeScript
- Tailwind CSS
- An internal, amplitude-invariant YIN pitch detector

## Getting Started

Install dependencies:

```bash
npm install
```

Start development:

```bash
npm run dev
```

Run the automated tuner tests:

```bash
npm test
```

Run tests continuously while developing:

```bash
npm run test:watch
```

Build a production bundle:

```bash
npm run build
```

Create a packaged build:

```bash
npm run package
```

## Load The Extension

After starting dev or creating a build, load the generated extension directory in your browser.

For Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select `build/chrome-mv3-dev` for a development build or `build/chrome-mv3-prod` for a production build

Once loaded, open the extension popup or the side panel and allow microphone access when prompted.

## Permissions

Pitchnode currently requests:

- `microphone` to analyze incoming audio
- `sidePanel` to expose the tuner in the browser side panel
- `https://*/*` host permission, as currently declared in `package.json`

## Project Structure

```text
.
├── popup.tsx                 # Popup entry
├── sidepanel.tsx             # Side panel entry
├── src
│   ├── components/TunerUI.tsx
│   ├── hooks/useTuner.ts
│   ├── utils/noteResolver.ts
│   ├── utils/pitchDetector.ts
│   ├── utils/pitchDetector.test.ts
│   ├── utils/pitchTracker.ts
│   ├── utils/pitchTracker.test.ts
│   └── style.css
└── vitest.config.mts
```

## How It Works

The live audio pipeline is:

1. `useTuner` requests the selected microphone with browser echo cancellation, noise suppression, and automatic gain control disabled.
2. A 30 Hz high-pass filter removes DC and low room rumble.
3. `pitchDetector` runs an amplitude-invariant YIN calculation over the newest 2,048 samples and searches only the supported `50–2000 Hz` range.
4. `pitchTracker` confirms a new note across two matching frames within 120 ms. It then smooths only readings that belong to that same note, so a new note is never blended with the old frequency.
5. `noteResolver` converts the accepted frequency into a note, octave, target frequency, MIDI note, and cents offset.
6. `TunerUI` renders the shared pedal-style popup and side-panel interface.

The detector uses reusable processing buffers and a fixed `0.001 RMS` noise gate. Its threshold does not rise after a loud note, allowing a clean quieter note to be recognized without having to overpower the previous input level.

## Tuning Tips

- Select the intended microphone or audio interface from the input menu when more than one is available.
- For a room microphone, place the instrument close enough to remain above the ambient noise floor without clipping the input.
- Mute the previous string before checking the next one for the clearest and fastest transition.
- Let the initial pick transient settle briefly if the display does not immediately lock onto a note.

## Detection Behavior and Limitations

- The supported range is `50–2000 Hz`, covering drop-A guitar and higher notes but not bass E1.
- The last accepted reading remains visible for 750 ms. Silence, noise, and rejected pitch frames do not extend the hold.
- A single outlier cannot change the displayed note; two matching valid frames are required.
- Pitchnode is monophonic. If two strings continue ringing together, it may retain the dominant note or wait until the mixed signal resolves.
- Concert pitch is fixed at A4 = 440 Hz.

## Tests

The Vitest suite uses generated sine waves, harmonic-rich guitar-like signals, deterministic room noise, and tracker sequences. It covers:

- Drop A and all six standard guitar strings at 44.1 and 48 kHz
- Quiet and loud signals, including a follow-up note 20 dB quieter than the previous note
- Harmonics, room-like noise, DC offset, silence, and attack impulses
- Note changes, isolated outliers, semitone-boundary jitter, smoothing, and stale-reading expiry

Run the complete suite with `npm test`.

## Author

Built by `pierres.dev`.
