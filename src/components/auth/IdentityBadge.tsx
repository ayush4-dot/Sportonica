"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Smartphone } from "lucide-react";

// Live "what did you type" hint for the unified Mobile-or-email field.
// Nothing until there's input; then a pill that crossfades between
// Mobile / Email as the value changes.
export default function IdentityBadge({ value }: { value: string }) {
  const v = value.trim();
  const kind: "email" | "mobile" | null =
    v.length === 0 ? null : v.includes("@") ? "email" : "mobile";

  return (
    <AnimatePresence mode="wait">
      {kind && (
        <motion.span
          key={kind}
          className={`ident-badge ${kind}`}
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.9 }}
          transition={{ duration: 0.18 }}
        >
          {kind === "email" ? <AtSign size={12} /> : <Smartphone size={12} />}
          {kind === "email" ? "Email" : "Mobile"}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
