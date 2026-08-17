"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { consumeHardwareBack } from "@/lib/capacitor/hardwareBack";

// Same two colors the theme system already uses — --ink for "glass"
// (dark) and the paper background for "paper" (light), see
// src/lib/useTheme.ts and src/app/layout.tsx's viewport.themeColor.
const THEME_BG: Record<string, string> = { glass: "#0B0D11", paper: "#F2EDE6" };

function syncStatusBar() {
  const theme = document.documentElement.dataset.theme === "glass" ? "glass" : "paper";
  StatusBar.setBackgroundColor({ color: THEME_BG[theme] }).catch(() => {});
  // Style.Light = light icons (for the dark "glass" bg), Style.Dark =
  // dark icons (for the light "paper" bg) — named for the status bar
  // CONTENT color, not the background, which trips people up.
  StatusBar.setStyle({ style: theme === "glass" ? Style.Light : Style.Dark }).catch(() => {});
}

// Native-only wiring, mounted once in the root layout. No-ops entirely
// on the web (Capacitor.isNativePlatform() is false there) so this is
// safe to render on every page regardless of platform.
export default function CapacitorBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Scopes the "kill every webpage tell" rules in globals.css (tap
    // highlight, long-press callout, overscroll bounce) to the native
    // app only — the website keeps normal browser behavior.
    document.documentElement.classList.add("capacitor-native");

    // launchAutoHide is off (capacitor.config.ts) specifically so this
    // fires once this component — meaning the remote page — has actually
    // mounted, rather than a fixed timer that risks a blank-white gap on
    // a slow connection or hanging around too long on a fast one.
    SplashScreen.hide().catch(() => {});

    // Match the status bar to whichever theme is active, and keep it in
    // sync when the user flips the toggle (see src/lib/useTheme.ts).
    syncStatusBar();
    window.addEventListener("khelamna-theme-change", syncStatusBar);

    // Universal Link (iOS) / App Link (Android) reopening the app —
    // this is how a Google Sign-In started via Browser.open() (see
    // GoogleButton.tsx) hands control back once it lands on
    // /auth/callback and finishes. Also covers any other khelamna.com
    // link opened from outside the app (a shared game link, etc).
    const urlSub = App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      Browser.close().catch(() => {});
      try {
        const url = new URL(event.url);
        router.push(`${url.pathname}${url.search}${url.hash}`);
      } catch {
        // Not a URL we can parse into an in-app route — ignore rather
        // than crash the listener.
      }
    });

    // Hardware back: a wizard/modal on screen gets first refusal (see
    // hardwareBack.ts) so it can step back through its own state
    // instead of the press falling through to page navigation. If
    // nothing claims it, behave like a normal back button — go back in
    // the WebView's history, or exit at the root.
    const backSub = App.addListener("backButton", ({ canGoBack }) => {
      if (consumeHardwareBack()) return;
      if (canGoBack) window.history.back();
      else App.exitApp();
    });

    return () => {
      window.removeEventListener("khelamna-theme-change", syncStatusBar);
      urlSub.then((s) => s.remove());
      backSub.then((s) => s.remove());
    };
  }, [router]);

  return null;
}
