"use client";

import type { SkillLevel } from "@/lib/playTogether/types";

// Same four values as SKILL_LABEL in src/lib/play/gameQueries.ts (the
// regular-events system) — kept as a separate small picker here rather
// than importing that file, since it pulls in the events query module.
export const SKILL_LEVEL_OPTIONS: { value: SkillLevel; label: string }[] = [
  { value: "any", label: "Any level" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  any: "All levels",
  beginner: "Beginner friendly",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export default function SkillLevelPicker({
  value, onChange,
}: {
  value: SkillLevel;
  onChange: (v: SkillLevel) => void;
}) {
  return (
    <div className="bk-chips">
      {SKILL_LEVEL_OPTIONS.map((o) => (
        <button
          key={o.value} type="button"
          className={`bk-chip ${value === o.value ? "on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
