# Working with the mobile subtrees

`ios/` and `android/` in the [`Sportonica`](https://github.com/ayush4-dot/Sportonica)
web repo are [git subtrees](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging)
of the dedicated shells:

| Subtree prefix | Source repo | Remote name (suggested) |
|----------------|-------------|-------------------------|
| `ios/`     | `git@github.com:ayush4-dot/sportonica-ios.git`     | `ios-shell`     |
| `android/` | `git@github.com:ayush4-dot/sportonica-android.git` | `android-shell` |

## One-time setup (in a fresh clone of the web repo)

```sh
git remote add ios-shell     https://github.com/ayush4-dot/sportonica-ios.git
git remote add android-shell https://github.com/ayush4-dot/sportonica-android.git
git fetch ios-shell android-shell
```

## Where to make native changes

Make them **in the dedicated repo** (`sportonica-ios` / `sportonica-android`),
open a PR there, merge. Then pull the result into the web repo.

## Pull the latest native code into the web repo

```sh
git subtree pull --prefix=ios     ios-shell     main --squash
git subtree pull --prefix=android android-shell main --squash
```

Commit the merge, open a PR against the web repo `main`.

## Push web-repo changes back up (rare)

If a native fix landed in the web repo first:

```sh
git subtree push --prefix=ios     ios-shell     sync/from-web
git subtree push --prefix=android android-shell sync/from-web
```

Then open a PR in the shell repo from `sync/from-web` → `main`.

## Rule of thumb

Pick **one** direction per change. Don't edit the same native file in both repos
between syncs — that's the drift we're trying to avoid.
