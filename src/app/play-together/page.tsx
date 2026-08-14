import { redirect } from "next/navigation";

// The standalone browse listing here duplicated /discover, which already
// merges Play Together games into its own card grid (same filters/sort/map
// as every other game) — this route now just forwards old links/bookmarks
// there instead of maintaining a second, redundant listing page. Individual
// game pages (/play-together/[gameId], its /manage, and /play-together/new)
// are untouched — only this top-level listing redirects.
export default function PlayTogetherPage() {
  redirect("/discover");
}
