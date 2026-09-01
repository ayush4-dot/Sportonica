# Decisions

Short log of choices we don't want to relitigate. Newest first.

## 2026-09-01 — One repo, long-lived branches

- **Everything is in `ayush4-dot/Sportonica`.** No GitHub org (deferred; the
  token also lacks `admin:org`). Second person is added as a collaborator.
- **`main`** = web app. **`ios`**, **`android`**, **`changes`** are long-lived
  branches, each split out of `main` with `git filter-repo` so they carry only
  their own file history.
- **`ios/` and `android/` also live on `main`** as git subtrees, so
  `npx cap sync` / CI work. The `ios` / `android` branches are the source of
  truth; `git subtree pull` moves changes onto `main`. See `subtrees.md`.
- **DB scripts** are on the `changes` branch under `supabase/`, not on `main` —
  they aren't used at build/run time and are easier to review on their own.
- Considered and rejected: 4 separate repos (built first, then switched — the
  owner preferred a single repo with branches).

## Template

```
## YYYY-MM-DD — <title>

- **Decision:** ...
- **Why:** ...
- **Alternatives considered:** ...
```
