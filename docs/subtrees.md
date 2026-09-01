# Working with the mobile branches & subtrees

The `Sportonica` repo keeps the native shells in two places:

- On their own branches — **`ios`** and **`android`** — where the shell is a
  standalone project (files at branch root). This is the source of truth.
- On **`main`**, under `ios/` and `android/`, as **git subtrees** so
  `npx cap sync` and CI work against a normal Capacitor project layout.

Both must be kept in step. These commands are how.

## Where to make native changes

Make them on the **`ios` / `android` branch**, then pull the result into `main`'s
subtree. Pick one direction per change — never edit the same native file on both
`main` and the branch between syncs.

### Check out a native branch alongside main

```sh
git worktree add ../sportonica-ios ios
# ...edit, commit, push in ../sportonica-ios...
```

### Pull the latest native code into main's subtree

From a `main` checkout:

```sh
git fetch origin
git subtree pull --prefix=ios     origin ios     --squash
git subtree pull --prefix=android origin android --squash
```

Commit the merge (subtree does it for you) and open a PR against `main`.

### Push a main-first native fix back to the branch (rare)

```sh
git subtree push --prefix=ios origin ios
```

Then reconcile on the `ios` branch.

## Why not just one copy?

The branch alone can't be built by Capacitor (it wants `<web>/ios/`). The subtree
alone loses the clean standalone history. Keeping both, synced deliberately, beats
either.
