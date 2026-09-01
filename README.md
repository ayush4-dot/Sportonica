# `changes` branch

This is a **branch of the [`Sportonica`](https://github.com/ayush4-dot/Sportonica)
repo**, not a folder on `main`. It holds the things that span the whole project
but aren't web-app code:

- **`CHANGELOG.md`** — one running log of everything shipped (web, iOS, Android, DB).
- **`supabase/`** — all database scripts (schema, RLS policies, migrations,
  one-off maintenance). Nothing here is imported by the app at build or run time.
- **`CONTRIBUTING.md`** — how the two of us work: branches, PRs, reviews.
- **`docs/`** — `subtrees.md`, `decisions.md`, `roadmap.md`.
- **Issues / Projects** (on the repo) — planning and tracking.

## Branch layout

| Branch | Contents |
|--------|----------|
| `main` | Web app (Next.js). Carries `ios/` and `android/` as git subtrees. |
| `ios` | iOS Capacitor shell, standalone. Source of truth for `main`'s `ios/` subtree. |
| `android` | Android Capacitor shell, standalone. Source of truth for `main`'s `android/` subtree. |
| `changes` | This branch. |

`ios`, `android`, and `changes` have histories independent of `main` — they were
split out of it with `git filter-repo`, so each carries only the commits that
ever touched its files.

## Working on this branch

```sh
git worktree add ../sportonica-changes changes
cd ../sportonica-changes
```

Edit, commit, push. Or open a PR `changes` ← a topic branch, same as any other.

## Database scripts

`supabase/` is SQL a human runs in the Supabase SQL editor after review. When a
script has been applied to production, note the date in `CHANGELOG.md`.
