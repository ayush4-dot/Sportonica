# Changelog

All notable changes to Sportonica — web, iOS, and Android — are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
One list, all repos. Tag each entry with the area in brackets: `[web]`,
`[ios]`, `[android]`, `[db]`, `[infra]`.

## [Unreleased]

### Added
- `[db]` `tournament_admin_delete_team.sql` — `admin_delete_tournament_team()`
  lets a tournament organiser, a venue manager on the host venue, or a super
  admin permanently delete one registered team (its roster and match
  player-stats cascade). Refused (`TEAM_HAS_RESULTS`) once the team has played a
  real two-team `completed`/`walkover` match. Deletes the team's `payments` rows
  and any `tournament_matches` referencing it first (the FKs that would block
  the delete), then `regenerate_tournament_fixtures()` rebuilds the bracket from
  the remaining confirmed teams when nothing has been played yet. Idempotent.
  Applied to production 2026-09-04. Pairs with the app-code PR
  `tournaments/admin-delete-team` on `main`.
- `[db]` `tournament_team_coach.sql` — splits the single "team manager / coach"
  contact into two people: the already-required team manager, and a new
  **optional** coach (`coach_name` / `coach_phone` on `tournament_teams`).
  `register_team()`, `update_team_details()` and `update_team_manager()` gain
  trailing optional `p_coach_name` / `p_coach_phone` params — existing callers
  that omit them keep working, and coach is nullable so nothing breaks.
  `create_walkin_team()` is deliberately untouched (that path doesn't collect a
  coach). Idempotent, not destructive — existing teams get `coach_* = null`.
  Applied to production 2026-09-04. Pairs with the app-code PR
  `tournaments/team-coach` on `main`.
- `[web]` Team manager / coach are now separate: the registration form (and
  "register again") has its own optional Coach name/phone row, the "Manager /
  coach" labels become "Team manager", and the Control Center's inline manager
  editor plus the public Teams tab / squad modal show the coach. Organisers /
  venue managers / super admins get a **Delete** button per team in the
  Control Center → Registrations table, and a printable **team dossier**
  (`/organize/tournaments/[id]/teams/sheet`, one team or all) with full profile
  + roster, ready to save as PDF. The public tournament page takes a `?tab=`
  deep link, and the share-card QR now drops the scanner straight onto the
  registration form while registration is open.
- `[db]` `rls_hardening.sql` — closes privilege holes from the security review:
  removes the direct `court_bookings` INSERT policy (RPC-only now), drops the
  client UPDATE on the legacy `bookings` table, adds guard triggers so a user
  can't self-edit `profiles.trust_score` / game-stat counters and a venue owner
  can't self-set `verification_status` / `payout_cap` / `owner_id`, locks the
  `notifications` insert path, revokes `venue_daily_stats` from `authenticated`,
  and adds a `WITH CHECK` to the `tournament_teams` captain UPDATE policy.
  Idempotent, not destructive. Applied to production 2026-09-03.
- `[db]` `identity_validation.sql` — enforces email/phone rules at the DB level
  so they can't be bypassed by calling the auth API directly: `is_valid_email()`
  + `normalize_phone()` helpers, a partial unique index on `profiles.phone`, and
  `handle_new_user()` extended to copy + validate the phone from signup metadata
  (rejects a bad email `EMAIL_INVALID`, a non-10-digit phone `PHONE_INVALID`, a
  duplicate `PHONE_TAKEN` — aborting the signup transactionally). Adds
  `email_for_phone()` (SECURITY DEFINER) so the app can resolve a phone to its
  account email for phone-based login. Idempotent; normalises existing
  `profiles.phone` values. Applied to production 2026-09-03. Pairs with the
  app-code PR `feat/unified-auth-redesign` on `main`.
- `[db]` `booking_payment_gated.sql` + `booking_no_double.sql` +
  `realtime_availability.sql` — a court slot is BOOKED only once its payment is
  approved. `court_booking_slot_state()` returns `booked` (paid / staff walk-in)
  or `free` — a reserved/unpaid row never holds the slot. `book_court()` gains a
  staff guard for walk-in/phone bookings + a past-time check and only conflicts
  against settled bookings. `court_busy_slots()` (SECURITY DEFINER, no PII) is
  what the picker reads so it can see other players' bookings past RLS.
  `block_double_paid_booking` trigger + a paid-only gist exclusion constraint
  make "first approved payment wins" airtight (`SLOT_ALREADY_BOOKED`).
  `free_slot_on_payment_rejected` / `expire_stale_court_holds()` sweep abandoned
  rows. `realtime_availability.sql` adds a world-readable
  `court_availability_pings` table (court + day only) so the picker updates live.
  `check_booked_slots.sql` is a read-only diagnostic. Idempotent, not
  destructive. Applied to production 2026-09-03. Pairs with the app-code PR
  `feat/payment-gated-booking` on `main`.
- `[db]` `tournament_team_registration_details.sql` — client-requested fuller
  team profile at registration: club name/address, a contact person
  (name/phone/email) distinct from the team manager/coach, and an optional
  team logo (`team-logos` bucket). All required except the logo — enforced
  in `register_team()`; `create_walkin_team()` keeps them optional. Also
  adds an optional per-player jersey number (unique per team) across
  `add_team_guest_player`, `add_walkin_team_player`,
  `update_team_player_guest`, walk-in member batches, and a new
  `set_team_player_jersey_number()` for editing it later. New
  `update_team_details()` RPC edits the whole profile after registration.
  Applied to production 2026-09-03.
- `[web]` Registration form collects the new team-profile fields + logo
  upload; "register again" after a rejection/withdrawal now falls back to
  previously-saved values instead of silently blanking untouched fields.
  Admin walk-in-team form and roster modal gained matching optional fields
  and jersey-number editing for every roster row.
- `[db]` `tournament_host_qr_payments.sql` — tournaments carry the host's own
  payment QR (`host_payment_*` columns + `tournament-qr` bucket); registration
  fees are paid to the host and verified by the host via
  `verify_tournament_payment()` (super admin keeps the `review_payment()`
  fallback). Applied to production 2026-09-02.
- `[web]` Tournament create/edit form takes a payment QR + recipient details;
  the registration checkout shows the host's QR; the Control Center "Payments"
  tab is now actionable for organizers.

- `[db]` `tournament_match_bye_edit.sql` — `update_match_teams()` now
  actually implements clearing "Team B" as a bye: the match completes
  immediately (team A advances, no score) and its winner propagates
  downstream, same as a bracket-generated bye. Fixes a stuck-match bug
  where editing a fixture's teams and leaving Team B blank left the match
  unscheduled with no way to ever complete it. Applied to production
  2026-09-03.

- `[db]` `tournament_late_reg_refixture.sql` — `create_walkin_team()` now
  calls `regenerate_tournament_fixtures()` after adding a team: if a
  bracket/schedule already exists and nothing has been played yet, it's
  rebuilt from the current confirmed team list so fixtures always match
  who's actually registered. No-op once any match has a result. Applied
  to production 2026-09-03.
- `[web]` Fixtures tab: a "Regenerate fixtures" button, so an admin can
  force the same rebuild by hand (e.g. after assigning a late team's
  group in a group_knockout tournament) instead of relying only on the
  auto-call from adding a walk-in team.

### Changed
-

### Fixed
- `[db]` `regenerate_tournament_fixtures()` (`tournament_late_reg_refixture.sql`)
  treated any bracket-generated bye (a `completed` match with no
  opponent — `build_knockout_bracket` auto-resolves these, nothing is
  ever "played") as a real result, so it refused to auto-regenerate for
  any knockout bracket that had a bye at all — i.e. almost any bracket
  whose team count isn't a power of 2. Now only a real two-team
  completed/walkover match blocks a rebuild. First run against
  production failed (`42P13`, changing an existing function's return
  type needs a `drop function` first — production still had the earlier
  void-returning version); fixed and re-applied 2026-09-03.
- `[db]` `tournament_walkin_phone_optional.sql` had accidentally
  reintroduced the `registration_open`-only guard on `create_walkin_team()`
  that `tournament_team_edit.sql` deliberately removed — an
  organizer/venue-manager/super_admin could no longer add a walk-in team
  once registration closed. Removed again; capacity (`TOURNAMENT_FULL`)
  still applies. Applied to production 2026-09-03.

---

## 2026-09-01

### Changed
- `[infra]` Reorganised into one repo with long-lived branches: `ios`, `android`
  (native Capacitor shells, split out with history) and `changes` (this branch —
  DB scripts + conventions). `ios/` and `android/` remain on `main` as git
  subtrees synced from their branches.

### Added
- `[db]` `tournament_roster_edit_window.sql`, `delete_non_admin_users.sql`.
