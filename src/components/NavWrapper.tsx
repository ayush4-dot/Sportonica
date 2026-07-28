"use client";
import { usePathname } from "next/navigation";
import MagnetDock from "./layout/MagnetDock";
import NotificationBell from "./NotificationBell";
import MyGamesButton from "./MyGamesButton";
import NearbyPopup from "./NearbyPopup";

// Global chrome: the magnet dock, the top-right actions, and the "Near me" popup.
export default function NavWrapper() {
  const pathname = usePathname();
  // The nearby popup is for players — not the consoles or auth pages.
  const hideNearby =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/platform") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup");

  return (
    <>
      <MagnetDock />
      <MyGamesButton />
      <NotificationBell />
      {!hideNearby && <NearbyPopup />}
    </>
  );
}
