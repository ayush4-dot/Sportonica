# Decisions

Short log of choices we don't want to relitigate. Newest first.

## 2026-09-01 — Repo layout

- **Four repos, no GitHub org.** Everything under `ayush4-dot`, second person
  added as a collaborator per repo. Can move to an org later without losing
  history or issues.
- **Mobile shells get their own repos**, and are also present in the web repo as
  **git subtrees** (squashed). Rationale: the native shells are rarely touched,
  but keeping them in the web repo means `npx cap sync` and CI "just work".
  Subtrees give a deliberate sync point instead of two copies drifting.
- **DB scripts live in `sportonica-changes/supabase/`**, not the web repo. They
  aren't used at build/run time, and reviewing them separately from app code
  keeps schema changes visible.

## Template

```
## YYYY-MM-DD — <title>

- **Decision:** ...
- **Why:** ...
- **Alternatives considered:** ...
```
