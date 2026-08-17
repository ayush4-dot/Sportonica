"use client";

import { useEffect } from "react";

// Lets whichever screen is currently on top (a booking wizard's own
// step, a modal, etc.) claim the Android hardware back button before
// CapacitorBridge.tsx falls through to its default (browser-style
// history.back(), or exit the app at the root). A handler returns true
// if it consumed the press, false to let the default behavior run.
// Last-registered wins — only ever one wizard/modal is "on top" at once.
type BackHandler = () => boolean;
const stack: BackHandler[] = [];

export function useHardwareBack(handler: BackHandler) {
  useEffect(() => {
    stack.push(handler);
    return () => {
      const i = stack.lastIndexOf(handler);
      if (i !== -1) stack.splice(i, 1);
    };
  });
}

// Called by CapacitorBridge.tsx on every hardware back press.
export function consumeHardwareBack(): boolean {
  const top = stack[stack.length - 1];
  return top ? top() : false;
}
