"use client";

import { useState, useEffect } from "react";

export type Theme = "glass" | "paper";

const KEY = "khelumna-theme";
const EVT = "khelumna-theme-change";

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(KEY, t);
  window.dispatchEvent(new Event(EVT));
}

// Shared theme state: any component using this hook stays in sync, and the
// choice persists across pages and visits via localStorage.
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("glass");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme) || "glass";
    applyTheme(saved);
    setTheme(saved);
    const onChange = () =>
      setTheme((document.documentElement.dataset.theme as Theme) || "glass");
    window.addEventListener(EVT, onChange);
    return () => window.removeEventListener(EVT, onChange);
  }, []);

  return [theme, (t) => { applyTheme(t); setTheme(t); }];
}
