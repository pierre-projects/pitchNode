# Pitchnode

Pitchnode is a browser extension tuner built with Plasmo, React, and TypeScript. It listens to a live microphone input, detects pitch in real time, resolves the nearest musical note, and shows whether the signal is flat, sharp, or in tune.

The extension currently ships with two entry points:

- `popup.tsx` for the compact popup tuner
- `sidepanel.tsx` for the full-height side panel tuner

## Features

- Real-time chromatic tuning using microphone input
- Live frequency readout in Hz
- Nearest-note detection with cents offset
- Visual flat / sharp / in-tune meter
- Audio input selection when multiple microphones are available
- Persisted preferred input device between sessions
- Popup and side panel UIs powered by the same tuner component

## Tech Stack

- Plasmo
- React 18
- TypeScript
- Tailwind CSS
- `pitchfinder` with the YIN detector

## Getting Started

Install dependencies:

```bash
npm install
```

Start development:

```bash
npm run dev
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
4. Select the generated build folder, typically `build/chrome-mv3-dev` for development

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
├── src/components/TunerUI.tsx
├── src/hooks/useTuner.ts
├── src/utils/noteResolver.ts
└── src/style.css
```

## How It Works

`useTuner` handles microphone access, audio device enumeration, pitch detection, smoothing, and tuner lifecycle state.

`noteResolver` converts a detected frequency into:

- nearest note name
- octave
- target frequency
- cents deviation from the target pitch

`TunerUI` renders the pedal-inspired tuner interface used by both the popup and the side panel.

## Current Behavior Notes

- Detection is constrained to roughly `40 Hz` to `2000 Hz`
- The tuner briefly holds the last valid reading when the input fades to reduce flicker
- If microphone access is denied or no device is available, the UI surfaces an error message

## Author

Built by `pierres.dev`.
