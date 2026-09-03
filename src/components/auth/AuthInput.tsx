"use client";

import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Eye, EyeOff } from "lucide-react";

// One animated field: a leading icon, a floating label, a focus glow that
// draws along the bottom edge, a pop-in check when the value becomes
// valid, and (for passwords) a show/hide toggle. Purely presentational —
// all state lives in the parent form.
export default function AuthInput({
  label, value, onChange, type = "text", icon, right, valid,
  autoComplete, inputMode, maxLength, onEnter, name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password" | "email" | "tel";
  icon?: ReactNode;
  right?: ReactNode;
  valid?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "email" | "numeric" | "tel";
  maxLength?: number;
  onEnter?: () => void;
  name?: string;
}) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && reveal ? "text" : type;

  return (
    <div className={`afield ${icon ? "has-icon" : ""}`}>
      {icon && <span className="afield-icon" aria-hidden>{icon}</span>}

      <input
        id={id}
        name={name}
        className="afield-input"
        type={effectiveType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder=" "
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
      />
      <label htmlFor={id} className="afield-label">{label}</label>
      <span className="afield-underline" aria-hidden />

      <div className="afield-adorn">
        <AnimatePresence>
          {valid && (
            <motion.span
              key="tick"
              className="afield-tick"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
            >
              <Check size={14} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
        {right}
        {isPassword && (
          <button
            type="button"
            className="afield-eye"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
