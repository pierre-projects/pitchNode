import { useTuner } from "~src/hooks/useTuner"

const NUM_BARS = 11
const CENTER = Math.floor(NUM_BARS / 2) // index 5

// Bell-curve heights centered on current centsOff position
function getBarHeights(centsOff: number): number[] {
  return Array.from({ length: NUM_BARS }, (_, i) => {
    const barCents = (i / (NUM_BARS - 1)) * 100 - 50 // -50..+50
    const distance = Math.abs(barCents - centsOff)
    return Math.max(8, 100 - distance * 2.2)
  })
}

// Each bar is amber (flat side) or red (sharp side) depending on position vs center
function getBarColor(barIndex: number, centsOff: number, height: number): string {
  const isFlat = centsOff < -3
  const isSharp = centsOff > 3
  const alpha = 0.12 + (height / 100) * 0.75

  if (isFlat && barIndex <= CENTER) return `rgba(245,158,11,${alpha})`   // amber
  if (isSharp && barIndex >= CENTER) return `rgba(220,38,38,${alpha})`   // red
  if (!isFlat && !isSharp) return `rgba(220,38,38,${alpha})`              // in-tune red
  return `rgba(80,30,30,${Math.min(alpha * 0.4, 0.2)})`                  // dim opposite side
}

function getMeterPos(centsOff: number): number {
  return ((Math.max(-50, Math.min(50, centsOff)) + 50) / 100) * 100
}

// Solid triangle drawn as SVG so Windows never swaps in the ◀ ▶ color emoji.
// Sized in em and filled with currentColor, so it follows the parent's font size and color.
function Arrow({ direction, size = "0.75em" }: { direction: "left" | "right"; size?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 10"
      style={{ width: size, height: size, display: "inline-block", fill: "currentColor", flexShrink: 0 }}>
      <polygon points={direction === "left" ? "9,1 9,9 1,5" : "1,1 1,9 9,5"} />
    </svg>
  )
}

function formatCents(c: number): string {
  const sign = c >= 0 ? "+" : ""
  return `${sign}${c.toFixed(1)}¢`
}

export function TunerUI() {
  const { status, noteInfo, frequency, errorMessage, startTuning, stopTuning,
          availableInputs, selectedInputId, setSelectedInputId } =
    useTuner()

  const isListening = status === "listening"
  const isError = status === "error"

  const centsOff = noteInfo?.centsOff ?? 0
  const inTune = noteInfo != null && Math.abs(centsOff) <= 3
  const isFlat = noteInfo != null && centsOff < -3
  const isSharp = noteInfo != null && centsOff > 3
  const biglyOff = noteInfo != null && Math.abs(centsOff) > 8

  const barHeights = noteInfo ? getBarHeights(centsOff) : null
  const meterPos = noteInfo ? getMeterPos(centsOff) : 50

  const displayNote = noteInfo?.note ?? "--"
  const displayFreq = frequency != null ? `${frequency.toFixed(2)} Hz` : "--- Hz"
  const displayCents = noteInfo != null ? formatCents(centsOff) : "±0.0¢"

  // Color tokens
  const flatColor = "#f59e0b"  // amber
  const sharpColor = "#dc2626" // red
  const tuneColor = "#dc2626"  // same red, full glow when in tune

  // In tune = neutral dark print on the cream panel (flat/sharp keep their amber/red)
  const centsColor = inTune ? "#1a1a1a" : isFlat ? flatColor : isSharp ? sharpColor : "#555"
  const dotColor = inTune ? tuneColor : isFlat ? flatColor : isSharp ? sharpColor : "#2a0a0a"
  const dotGlow = inTune
    ? "0 0 10px 4px rgba(220,38,38,0.85)"
    : isFlat
    ? "0 0 8px 3px rgba(245,158,11,0.7)"
    : isSharp
    ? "0 0 8px 3px rgba(220,38,38,0.6)"
    : "none"

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-between select-none"
      style={{ background: "#f0ede8", padding: "18px 20px 16px" }}>

      {/* ── Header ── */}
      <div className="w-full flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-black tracking-[0.3em] uppercase"
          style={{ color: "#1a1a1a" }}>
          Pitchnode
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] tracking-widest uppercase" style={{ color: "#888" }}>
            {isListening ? "active" : isError ? "error" : "bypass"}
          </span>
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              background: isListening ? "#dc2626" : "#3d1010",
              boxShadow: isListening ? "0 0 6px 2px rgba(220,38,38,0.7)" : "none"
            }}
          />
        </div>
      </div>

      {/* ── Black display ── */}
      <div
        className="w-full flex-1 flex flex-col items-center justify-between"
        style={{
          background: "#0d0d0d",
          borderRadius: "6px",
          border: "2px solid #1a1a1a",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.08)",
          padding: "14px 16px 12px"
        }}>

        {/* Strobe bars */}
        <div className="w-full flex items-end justify-center gap-[3px]" style={{ height: "44px" }}>
          {barHeights
            ? barHeights.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    maxHeight: "100%",
                    borderRadius: "1px",
                    background: getBarColor(i, centsOff, h),
                    transition: "height 55ms ease-out, background 120ms ease-out"
                  }}
                />
              ))
            : Array.from({ length: NUM_BARS }, (_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: i === CENTER ? "18%" : "8%",
                    borderRadius: "1px",
                    background: "rgba(80,20,20,0.5)"
                  }}
                />
              ))}
        </div>

        {/* Note name + direction arrow */}
        <div className="flex-1 flex items-center justify-center gap-2">
          {/* Left arrow (flat) */}
          <span
            className="font-black text-2xl leading-none"
            style={{
              color: flatColor,
              opacity: biglyOff && isFlat ? 1 : 0,
              transition: "opacity 150ms ease"
            }}>
            <Arrow direction="left" />
          </span>

          <span
            className="font-black leading-none"
            style={{
              fontSize: "86px",
              letterSpacing: "-4px",
              color: noteInfo ? tuneColor : "#2a0a0a",
              textShadow: noteInfo
                ? `0 0 30px rgba(220,38,38,${inTune ? 0.65 : 0.25})`
                : "none",
              fontVariantNumeric: "tabular-nums",
              transition: "color 150ms, text-shadow 150ms"
            }}>
            {displayNote}
          </span>

          {/* Right arrow (sharp) */}
          <span
            className="font-black text-2xl leading-none"
            style={{
              color: sharpColor,
              opacity: biglyOff && isSharp ? 1 : 0,
              transition: "opacity 150ms ease"
            }}>
            <Arrow direction="right" />
          </span>
        </div>

        {/* Tuning dot track */}
        <div className="w-full flex flex-col items-center gap-1.5">
          <div className="relative w-full flex items-center" style={{ height: "18px" }}>
            {/* Track */}
            <div
              className="absolute inset-0 flex items-center"
              style={{ top: "50%", transform: "translateY(-50%)" }}>
              <div className="w-full" style={{ height: "1px", background: "rgba(255,255,255,0.08)" }} />
            </div>
            {/* Dot */}
            <div
              style={{
                position: "absolute",
                left: `${meterPos}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                background: dotColor,
                boxShadow: dotGlow,
                transition: "left 60ms ease-out, background 120ms, box-shadow 120ms"
              }}
            />
          </div>

          {/* FLAT / SHARP labels */}
          <div className="w-full flex justify-between">
            <span
              className="flex items-center gap-[0.4em] text-[9px] font-black tracking-widest uppercase"
              style={{
                color: isFlat ? flatColor : "rgba(255,255,255,0.2)",
                transition: "color 150ms"
              }}>
              <Arrow direction="left" size="1em" />
              Flat
            </span>
            <span
              className="flex items-center gap-[0.4em] text-[9px] font-black tracking-widest uppercase"
              style={{
                color: isSharp ? sharpColor : "rgba(255,255,255,0.2)",
                transition: "color 150ms"
              }}>
              Sharp
              <Arrow direction="right" size="1em" />
            </span>
          </div>
        </div>
      </div>

      {/* ── Telemetry ── */}
      <div className="w-full flex items-center justify-between mt-2" style={{ padding: "0 2px" }}>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "#555", minWidth: "80px" }}>
          {displayFreq}
        </span>
        <span className="text-[9px] font-black tracking-[0.2em] uppercase" style={{ color: "#333" }}>
          Chromatic
        </span>
        {/* Cents — color coded */}
        <span
          className="font-mono text-[11px] font-bold tabular-nums text-right"
          style={{
            color: centsColor,
            minWidth: "48px",
            transition: "color 120ms"
          }}>
          {displayCents}
        </span>
      </div>

      {/* ── Error ── */}
      {isError && errorMessage && (
        <p className="text-[10px] text-red-600 text-center mt-1 leading-tight">
          {errorMessage}
        </p>
      )}

      {/* ── Stomp button ── */}
      <button
        onClick={isListening ? stopTuning : startTuning}
        className="w-full mt-3"
        style={{
          height: "52px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          position: "relative",
          background: isListening
            ? "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)"
            : "linear-gradient(180deg, #e8e5e0 0%, #ccc9c3 100%)",
          boxShadow: isListening
            ? "inset 0 2px 4px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05)"
            : "0 4px 0 #999, 0 5px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.7)",
          transform: isListening ? "translateY(2px)" : "translateY(0)",
          transition: "all 0.1s ease"
        }}>
        <span
          className="inline-flex items-center gap-[0.6em] font-black tracking-[0.25em] uppercase text-xs"
          style={{ color: isListening ? "#dc2626" : "#1a1a1a" }}>
          {isListening ? "■  Stop" : <><Arrow direction="right" size="1em" />Start</>}
        </span>
        <div style={{ position: "absolute", top: "6px", left: "8px", width: "8px", height: "8px", borderRadius: "50%", background: isListening ? "#333" : "#bbb", boxShadow: "inset 0 1px 1px rgba(0,0,0,0.3)" }} />
        <div style={{ position: "absolute", top: "6px", right: "8px", width: "8px", height: "8px", borderRadius: "50%", background: isListening ? "#333" : "#bbb", boxShadow: "inset 0 1px 1px rgba(0,0,0,0.3)" }} />
      </button>

      {/* ── Footer ── */}
      <div className="w-full flex items-center justify-between mt-2">
        <span className="text-[8px] tracking-widest uppercase" style={{ color: "#bbb" }}>Output</span>
        <a
          href="https://pierres.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[8px] tracking-[0.15em] uppercase"
          style={{ color: "#aaa", textDecoration: "none" }}>
          by pierres.dev
        </a>
        {availableInputs.length > 1 ? (
          <select
            value={selectedInputId ?? ""}
            onChange={(e) => setSelectedInputId(e.target.value || null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              fontSize: "8px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
              maxWidth: "90px",
              outline: "none"
            }}>
            <option value="">Default Input</option>
            {availableInputs.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Input ${i + 1}`}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[8px] tracking-widest uppercase" style={{ color: "#bbb" }}>Input</span>
        )}
      </div>
    </div>
  )
}
