// Shared between the first-run intro (components/Onboarding.tsx) and the
// header's "Where do you play?" city prompt (components/AppHeader.tsx),
// so the two first-run steps run in sequence instead of stacking.

/** localStorage flag — set once the intro has been finished or skipped. */
export const ONBOARDING_SEEN_KEY = "sportonica.onboarding.v1";

/** Window event the intro fires on dismissal, so the city prompt can take its turn. */
export const ONBOARDING_DONE_EVENT = "sportonica:onboarding-done";
