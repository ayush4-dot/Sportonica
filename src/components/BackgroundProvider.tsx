"use client";
import { useState } from "react";

export default function BackgroundProvider({ children }: { children: React.ReactNode }) {
    const [bgPosX, setBgPosX] = useState(50);
    const [bgPosY, setBgPosY] = useState(50);
    const [bgZoom, setBgZoom] = useState(400);
    const [bgOpacity, setBgOpacity] = useState(100);
    const [bgBlur, setBgBlur] = useState(0);
    const [showControls, setShowControls] = useState(false);

    const sliderTrack: React.CSSProperties = {
        width: "100%",
        height: "4px",
        borderRadius: "2px",
        appearance: "none" as const,
        background: "rgba(255,255,255,0.15)",
        outline: "none",
        cursor: "pointer",
    };

    return (
        <>
            {/* ── FIXED BACKGROUND LAYER ── */}
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 0,
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: bgBlur > 0 ? `-${bgBlur * 2}px` : 0,
                        backgroundImage: "url('/bb.png')",
                        backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                        backgroundSize: `${bgZoom}px`,
                        backgroundRepeat: "repeat",
                        opacity: bgOpacity / 100,
                        filter: bgBlur > 0 ? `blur(${bgBlur}px)` : "none",
                        imageRendering: "auto",
                        transition: "opacity 0.3s ease, filter 0.3s ease",
                    }}
                />
            </div>

            {/* ── PAGE CONTENT ── */}
            <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
                {children}
            </div>

            {/* ── FLOATING TOGGLE ── */}
            <button
                onClick={() => setShowControls(prev => !prev)}
                style={{
                    position: "fixed",
                    bottom: "1.5rem",
                    left: "1.5rem",
                    zIndex: 99999,
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: showControls
                        ? "linear-gradient(135deg, #de3163, #E85D24)"
                        : "rgba(30,41,59,0.7)",
                    border: "2px solid rgba(255,255,255,0.25)",
                    color: "#fff",
                    fontSize: "18px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                    transition: "all 0.2s ease",
                }}
                title="Adjust background"
            >
                🎨
            </button>

            {/* ── CONTROLS PANEL ── */}
            {showControls && (
                <div
                    style={{
                        position: "fixed",
                        bottom: "5rem",
                        left: "1.5rem",
                        zIndex: 99999,
                        background: "rgba(15,15,25,0.92)",
                        backdropFilter: "blur(24px) saturate(180%)",
                        borderRadius: "18px",
                        padding: "1.25rem 1.5rem",
                        width: "280px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
                        fontFamily: "'Inter', system-ui, sans-serif",
                        animation: "bgPanelIn 0.25s ease",
                    }}
                >
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem", letterSpacing: "-0.3px" }}>
                            🖼️ Background
                        </span>
                        <button
                            onClick={() => {
                                setBgPosX(50); setBgPosY(50);
                                setBgZoom(400); setBgOpacity(100); setBgBlur(0);
                            }}
                            style={{
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "rgba(255,255,255,0.5)",
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                padding: "4px 10px",
                                borderRadius: "8px",
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            Reset
                        </button>
                    </div>

                    {/* Sliders */}
                    {[
                        { label: "Position X", value: bgPosX, set: setBgPosX, min: 0, max: 100, unit: "%" },
                        { label: "Position Y", value: bgPosY, set: setBgPosY, min: 0, max: 100, unit: "%" },
                        { label: "Tile Size", value: bgZoom, set: setBgZoom, min: 100, max: 800, unit: "px" },
                        { label: "Opacity", value: bgOpacity, set: setBgOpacity, min: 0, max: 100, unit: "%" },
                        { label: "Blur", value: bgBlur, set: setBgBlur, min: 0, max: 20, unit: "px" },
                    ].map(s => (
                        <div key={s.label} style={{ marginBottom: "0.75rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.72rem", fontWeight: 600 }}>{s.label}</span>
                                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.68rem", fontVariantNumeric: "tabular-nums" }}>
                                    {s.value}{s.unit}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={s.min}
                                max={s.max}
                                value={s.value}
                                onChange={e => s.set(Number(e.target.value))}
                                style={sliderTrack}
                            />
                        </div>
                    ))}

                    {/* CSS readout */}
                    <div style={{
                        marginTop: "0.5rem",
                        padding: "8px 10px",
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: "8px",
                        fontSize: "0.62rem",
                        fontFamily: "monospace",
                        color: "rgba(255,255,255,0.28)",
                        lineHeight: 1.7,
                    }}>
                        position: {bgPosX}% {bgPosY}%<br />
                        size: {bgZoom <= 100 ? "cover" : `${bgZoom}%`}<br />
                        opacity: {(bgOpacity / 100).toFixed(2)}<br />
                        blur: {bgBlur}px
                    </div>
                </div>
            )}

            {/* Panel animation keyframes */}
            <style>{`
                @keyframes bgPanelIn {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    );
}
