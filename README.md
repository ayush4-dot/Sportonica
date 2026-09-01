# sportonica-changes

The coordination repo for Sportonica. It is deliberately **not** application
code — it holds the things that span every other repo:

- **`CHANGELOG.md`** — one running log of everything shipped, across web and mobile.
- **`supabase/`** — all database scripts (schema, RLS policies, migrations,
  one-off maintenance). Reviewed here, separate from app code.
- **`CONTRIBUTING.md`** — how the two of us work: branches, PRs, reviews.
- **`docs/`** — decisions, roadmap, and notes.
- **Issues / Projects** — planning and task tracking for all repos.

## Repository map

| Repo | Purpose |
|------|---------|
| [`Sportonica`](https://github.com/ayush4-dot/Sportonica) | Main / web app (Next.js). Contains `ios/` and `android/` as **git subtrees**. |
| [`sportonica-ios`](https://github.com/ayush4-dot/sportonica-ios) | iOS Capacitor native shell. Source of truth for the `ios/` subtree. |
| [`sportonica-android`](https://github.com/ayush4-dot/sportonica-android) | Android Capacitor native shell. Source of truth for the `android/` subtree. |
| `sportonica-changes` | This repo — changelog, DB scripts, conventions, planning. |

## Database scripts

`supabase/` holds SQL that is run against the hosted Supabase project. Nothing
here is imported by the app at build or run time — the web app talks to Supabase
over the network. Treat every file as something a human runs in the SQL editor
after review.

When a script has been applied to production, note it in `CHANGELOG.md` under the
relevant date.
