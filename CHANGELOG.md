# Changelog

All notable changes to Sportonica — web, iOS, and Android — are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
One list, all repos. Tag each entry with the area in brackets: `[web]`,
`[ios]`, `[android]`, `[db]`, `[infra]`.

## [Unreleased]

### Added
-

### Changed
-

### Fixed
-

---

## 2026-09-01

### Changed
- `[infra]` Reorganised into one repo with long-lived branches: `ios`, `android`
  (native Capacitor shells, split out with history) and `changes` (this branch —
  DB scripts + conventions). `ios/` and `android/` remain on `main` as git
  subtrees synced from their branches.

### Added
- `[db]` `tournament_roster_edit_window.sql`, `delete_non_admin_users.sql`.
