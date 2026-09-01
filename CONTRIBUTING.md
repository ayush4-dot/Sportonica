# How we work

Two people, four repos. These rules keep it from turning into a mess. They apply
to **every** Sportonica repo, not just this one.

## Branches

- `main` is always deployable. Never commit to it directly — even for a typo.
- Branch names: `type/short-description`
  - `feat/roster-edit-window`
  - `fix/knockout-round-labels`
  - `chore/bump-capacitor`
  - `db/add-manager-columns`
- One branch = one logical change. If you can't summarise it in a sentence,
  it's two branches.

## Commits

- Present tense, imperative: "Add roster edit window", not "added" / "adds".
- First line ≤ 72 chars, no trailing period. Body explains *why*, not *what*.
- Keep unrelated changes out. No "misc fixes" commits.

## Pull requests

- Open a PR for every change. Fill in the template.
- Both of us review each other's PRs. Don't merge your own without at least a
  thumbs-up, unless it's trivial (typo, comment, version bump) **and** CI is green.
- Squash-merge. The PR title becomes the commit — make it a good one.
- Delete the branch after merge.

## After merging

- Add a line to [`CHANGELOG.md`](./CHANGELOG.md) in this repo under `[Unreleased]`.
- If it was a DB script, note when it was applied to production.

## Database changes

- SQL lives in `sportonica-changes/supabase/`.
- Every script must be safe to read top-to-bottom before running. Add a comment
  block at the top: what it does, whether it's idempotent, whether it's
  destructive.
- Open a PR for the script. The reviewer runs it against a scratch project or
  reads it carefully before approving.
- The author runs it against production and records the date in the changelog.

## The mobile subtrees

`ios/` and `android/` in the web repo are **git subtrees** of `sportonica-ios`
and `sportonica-android`. See [`docs/subtrees.md`](./docs/subtrees.md) for the
pull/push commands. Short version: make native changes in the dedicated repo,
then `git subtree pull` into the web repo.
