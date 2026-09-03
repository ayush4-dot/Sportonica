"use client";

import { motion } from "framer-motion";
import { passwordScore } from "@/lib/validation/password";

// Four-segment animated strength meter. Hidden until the user types.
export default function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const { score, label } = passwordScore(value);
  const filled = Math.max(score, 1);

  return (
    <div className="pwstr" aria-live="polite">
      <div className="pwstr-bars">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className={`pwstr-bar s${score}`}
            initial={false}
            animate={{ scaleX: i < filled ? 1 : 0.12, opacity: i < filled ? 1 : 0.3 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
          />
        ))}
      </div>
      <span className={`pwstr-label s${score}`}>{label}</span>
    </div>
  );
}
