# Product Management Document: PitchNode

**Project Name:** PitchNode
**Document Status:** V1.0 (MVP)
**Product Type:** Chrome Extension (Manifest V3)
**Target Audience:** Guitarists and musicians practicing or reading tabs in the browser.

## 1. Product Vision & Strategy
PitchNode is a lightweight, highly accurate browser-based tuner. Designed to eliminate the friction of pulling out a phone or physical tuner while practicing online, PitchNode lives directly in the browser. By offering both a quick-access Popup and a persistent Side Panel, it provides a seamless tuning experience whether a user is doing a quick tune-up or reading scrolling tabs during a long practice session. 

This MVP serves as the foundational module for a future, larger audio-to-data ecosystem.

## 2. Technical Stack
The stack is optimized for rapid development, modern Chrome extension standards, and strict typing to prevent runtime audio errors.

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | **Plasmo** | Handles Manifest V3 configuration, bundling, and React integration out of the box. |
| **Language** | **TypeScript** | Ensures strict data contracts between the audio engine and the UI. |
| **UI Library** | **React** | Drives the component-based architecture for sharing UI across extension views. |
| **Styling** | **Tailwind CSS** | Enables rapid, responsive styling that scales seamlessly from a small popup to a tall side panel. |
| **Audio Engine** | **Web Audio API** | Captures the raw microphone stream directly from the browser. |
| **DSP Math** | **`pitchfinder` (npm)** | Provides pre-optimized JavaScript implementations of the YIN/McLeod pitch detection algorithms. |

## 3. System Architecture
PitchNode utilizes a **Shared Component Architecture** to prevent code duplication across the Chrome Extension's different rendering contexts.

* **Logic Layer (`useTuner.ts`):** A custom React hook that initializes the `AudioContext`, requests microphone permissions, and runs the `pitchfinder` algorithm inside a `requestAnimationFrame` loop.
* **Utility Layer (`noteResolver.ts`):** Pure mathematical functions that convert the raw Hz output from `pitchfinder` into standardized musical data (Target Note, Target Frequency, Cents Off).
* **Presentation Layer (`TunerUI.tsx`):** A single, responsive React component that consumes the `useTuner` hook and renders the visual dial.
* **Entry Points (`popup.tsx` & `sidepanel.tsx`):** Plasmo-specific entry files that both import and mount the exact same `TunerUI` component.

## 4. Core Features & Requirements (MVP)

### 4.1. Audio Capture & Processing
* **Microphone Onboarding:** The extension must gracefully handle the initial `getUserMedia` permission request, providing clear UI feedback if the user denies access.
* **Real-Time Processing:** Pitch detection must run continuously when active, updating the frequency state with imperceptible latency (under 50ms).
* **Noise Gate:** The engine should ignore background noise, only registering a pitch when the volume passes a specific decibel threshold.

### 4.2. Dual-Mode Interface
* **Popup Mode:** Opens instantly upon clicking the extension icon. Ideal for a quick tune-up. Automatically suspends the audio context when the user clicks away and the popup closes.
* **Side Panel Mode:** A persistent vertical panel that remains open while the user navigates between different tabs. Requires the `"sidePanel"` Manifest V3 permission.

### 4.3. Visual Feedback UI
* **Primary Display:** Large, high-contrast text displaying the detected musical note (e.g., E, A, D, G, B).
* **Accuracy Indicator:** A visual mechanism (slider, dial, or digital LEDs) indicating how far off the pitch is.
* **Tuning Target:** The indicator must distinctly change color (e.g., turn green) when the pitch is within ±3 cents of the perfect target frequency.

## 5. Security & Permissions
To function securely within Chrome's Manifest V3 environment, the `manifest.json` will require the following exact permissions:
* `"audioCapture"`: Required to access the user's microphone.
* `"sidePanel"`: Required to mount the persistent UI mode.

## 6. Future Scope (Post-MVP)
While V1.0 is strictly a monophonic tuner, PitchNode is designed so the core logic can later be decoupled. In V2.0, the `useTuner` and `pitchfinder` logic will be extracted into an independent API package, allowing it to be dropped into mobile applications, full-stack Next.js applications, and polyphonic chord-detection systems.