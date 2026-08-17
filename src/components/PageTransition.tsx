"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";

// Never actually changes after mount, so subscribe is a no-op — this
// is purely to read a value that legitimately differs between server
// (always false, no window) and client (true on a real device) without
// the hydration mismatch a plain isNativePlatform() render-time check
// or a setState-in-effect would both cause.
const subscribe = () => () => {};
const getSnapshot = () => Capacitor.isNativePlatform();
const getServerSnapshot = () => false;

// Plain Next.js navigation reads as a browser page load — one of the
// "this is just a website" tells (see globals.css's capacitor-native
// rules for the others). Native-only: the website keeps normal
// same-page-instant navigation, which is the right feel for a browser.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const native = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!native) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
