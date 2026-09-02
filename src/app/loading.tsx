// Shown instantly on every client navigation while the next route's
// server render is in flight — without it, a click just freezes the old
// page (no feedback) until the new one is fully ready. Kept dependency-
// free so it's part of the base bundle and paints immediately.
export default function Loading() {
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        padding: 40,
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "3px solid rgba(0,98,65,0.18)",
          borderTopColor: "#006241",
          display: "block",
          animation: "sptn-spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes sptn-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
