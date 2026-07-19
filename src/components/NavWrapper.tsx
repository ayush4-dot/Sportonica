"use client";
import MagnetDock from "./layout/MagnetDock";
import ThemeToggle from "./ThemeToggle";

// Global chrome: the magnet dock + the Glass/Paper theme pill.
export default function NavWrapper() {
  return (
    <>
      <MagnetDock />
      <ThemeToggle />
    </>
  );
}
