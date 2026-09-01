"use client";

export type Theme = "paper";

// The app is cream/"paper" only now — there is no dark theme to switch
// to (there was never a real toggle exposed for it anyway; see git
// history for the old localStorage-backed "glass" dark theme this
// replaced). Kept as a hook, rather than just a constant, so existing
// callers (MosaicGrid, DownloadButton) don't need to change.
export function useTheme(): [Theme, (t: Theme) => void] {
  return ["paper", () => {}];
}
