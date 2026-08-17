"use client";

import { useState, useEffect } from "react";

export type Theme = "glass" | "paper";

// v2: bumped so pre-existing "glass" values written by the old default
// (nothing ever exposed a real theme toggle) don't shadow the new
// light-by-default rollout.
const KEY = "sportonica-theme-v2";
const EVT = "sportonica-theme-change";

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(KEY, t);
  window.dispatchEvent(new Event(EVT));
}

// Shared theme state: any component using this hook stays in sync, and the
// choice persists across pages and visits via localStorage. "paper" (light)
// is the default look across the app; "glass" (dark) is opt-in.
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("paper");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme) || "paper";
    applyTheme(saved);
    setTheme(saved);
    const onChange = () =>
      setTheme((document.documentElement.dataset.theme as Theme) || "paper");
    window.addEventListener(EVT, onChange);
    return () => window.removeEventListener(EVT, onChange);
  }, []);

  return [theme, (t) => { applyTheme(t); setTheme(t); }];
}
