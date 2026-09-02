# Supabase SQL

These files are applied by hand in the Supabase SQL editor — there is no migration
runner. Within a folder, run `schema/` first, then the feature folders, then anything
under `maintenance/` only when you specifically need it.

## schema/
| File | Purpose |
| --- | --- |
| `admin_schema.sql` | venues, courts, bookings, payouts — current base schema |
| `add_columns.sql` | profiles, RLS, `events_with_counts` view |
| `events_full.sql` | events tables + counts |
| `schema_full.sql` | full reference dump |

## tournaments/
`tournaments.sql` is the main table + RLS. The rest layer on features:
roster (`tournament_admin_roster.sql`), team editing (`tournament_team_edit.sql`,
`tournament_team_manager.sql`), detail editing (`tournament_edit_details.sql`),
captain self-edit of team name/manager (`tournament_captain_edit.sql` — run AFTER
`tournament_team_edit.sql` + `tournament_team_manager.sql`),
player self-claim (`tournament_player_claim.sql`), per-tournament owner grants
(`tournament_owner_access.sql`), and knockout round labels
(`knockout_round_of_labels.sql`).

## play-together/
`play_together.sql` (games + state machine), `play_together_payments.sql`
(join-request payment flow), `play_together_cash_payment.sql` (cash option).

## payments/
`payments.sql` — payment submission, `review_payment()`, `confirm_free_booking()`,
`maybe_publish_hosted_event()`.

## venues/
`book_court_dedupe.sql`, `booking_phone.sql`, `booking_self_service.sql`
(`booking_audit_logs` + `edit_court_booking()` / `cancel_court_booking()` /
`edit_game_join()` / `cancel_game_join()` — run AFTER `schema/admin_schema.sql`,
`booking_phone.sql` and `payments/payments.sql`).

## organizer/
`organizer_approval_and_own_venue.sql`, `organizer_partnerships.sql`, `host_tools.sql`.

## social/
`friends_and_dms.sql`, `game_groups.sql`, `group_links.sql`.

## notifications/
`notifications.sql` (base table + bell), `notifications_insert_policy_fix.sql`
(insert-policy fix), `notifications_kind_check.sql` (authoritative `kind` CHECK
constraint — run LAST; it's the full kind set, every other file only adds its
own slice and the last writer wins).

## maintenance/
One-off scripts — run only when needed. `fix_role_escalation.sql` (security patch),
`reset_venues_and_tournaments.sql` (destructive: wipes venues + tournaments).
