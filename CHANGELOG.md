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
- `[infra]` Split the monorepo: `ios/` and `android/` moved to dedicated repos
  (`sportonica-ios`, `sportonica-android`) and re-added to the web repo as git
  subtrees. Database scripts moved to `sportonica-changes/supabase/`.

### Added
- `[db]` `tournament_roster_edit_window.sql`, `delete_non_admin_users.sql`.
