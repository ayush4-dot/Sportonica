# Changelog

All notable changes to Sportonica — web, iOS, and Android — are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
One list, all repos. Tag each entry with the area in brackets: `[web]`,
`[ios]`, `[android]`, `[db]`, `[infra]`.

## [Unreleased]

### Added
- `[db]` `tournament_host_qr_payments.sql` — tournaments carry the host's own
  payment QR (`host_payment_*` columns + `tournament-qr` bucket); registration
  fees are paid to the host and verified by the host via
  `verify_tournament_payment()` (super admin keeps the `review_payment()`
  fallback). Applied to production 2026-09-02.
- `[web]` Tournament create/edit form takes a payment QR + recipient details;
  the registration checkout shows the host's QR; the Control Center "Payments"
  tab is now actionable for organizers.

- `[db]` `tournament_late_reg_refixture.sql` — `create_walkin_team()` now
  calls `regenerate_tournament_fixtures()` after adding a team: if a
  bracket/schedule already exists and nothing has been played yet, it's
  rebuilt from the current confirmed team list so fixtures always match
  who's actually registered. No-op once any match has a result.

### Changed
-

### Fixed
- `[db]` `tournament_walkin_phone_optional.sql` had accidentally
  reintroduced the `registration_open`-only guard on `create_walkin_team()`
  that `tournament_team_edit.sql` deliberately removed — an
  organizer/venue-manager/super_admin could no longer add a walk-in team
  once registration closed. Removed again; capacity (`TOURNAMENT_FULL`)
  still applies.

---

## 2026-09-01

### Changed
- `[infra]` Reorganised into one repo with long-lived branches: `ios`, `android`
  (native Capacitor shells, split out with history) and `changes` (this branch —
  DB scripts + conventions). `ios/` and `android/` remain on `main` as git
  subtrees synced from their branches.

### Added
- `[db]` `tournament_roster_edit_window.sql`, `delete_non_admin_users.sql`.
