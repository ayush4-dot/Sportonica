export const metadata = { title: "Offline · Sportonica" };

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      background: "var(--bg)", color: "var(--paper)", padding: 24,
      fontFamily: "'Inter', system-ui, sans-serif", textAlign: "center",
    }}>
      <div style={{ maxWidth: 380 }}>
        {/* icon-192.png specifically — it's already in the service worker's
            PRECACHE list (see public/sw.js), so it's guaranteed available
            on this exact page even with zero network. mark.png isn't. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png" alt="" width={62} height={62}
          style={{ borderRadius: 16, margin: "0 auto 22px", display: "block" }}
        />

        <h1 style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 30, fontWeight: 800, letterSpacing: "-1px", margin: "0 0 10px",
        }}>
          You&apos;re offline
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, opacity: 0.65, margin: "0 0 26px" }}>
          Sportonica needs a connection to show live games and court availability.
          Check your network and try again.
        </p>

        <a href="/discover" style={{
          display: "inline-block", background: "#006241", color: "#ffffff",
          padding: "13px 26px", borderRadius: 12, fontWeight: 700,
          fontSize: 14.5, textDecoration: "none",
        }}>
          Try again
        </a>
      </div>
    </div>
  );
}
