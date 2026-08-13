// Reuses the same base wizard/card styling as the court-booking flow
// (bk-panel, bk-chip, play-btn, venue-card, …) so Play Together looks like
// part of the same product, not a bolted-on feature. play-together.css adds
// only the handful of classes specific to this flow (contribution badges,
// the cash-collection dashboard, the risk-acknowledgment box).
import "../(play)/play.css";
import "./play-together.css";

export default function PlayTogetherLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
