"use client";
import { usePathname } from "next/navigation";
import MagnetDock from "./layout/MagnetDock";
import AppHeader from "./AppHeader";
import NearbyPopup from "./NearbyPopup";
import AnimatedBackground from "./AnimatedBackground";
import EnsureE2EKey from "./EnsureE2EKey";

// Global chrome: the animated backdrop, the magnet dock, the top-right
// actions, and the "Near me" popup.
export default function NavWrapper() {
  const pathname = usePathname();
  // The consoles and auth pages have their own chrome — same set AppHeader
  // and MagnetDock already hide themselves on.
  const hideChrome =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/platform") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup");

  return (
    <>
      {!hideChrome && (
        <AnimatedBackground accent1="#DE3163" accent2="#A78BFA" accent3="#2E7D5B" opacity={0.4} />
      )}
      <AppHeader />
      <MagnetDock />
      <EnsureE2EKey />
      {!hideChrome && <NearbyPopup />}
    </>
  );
}
