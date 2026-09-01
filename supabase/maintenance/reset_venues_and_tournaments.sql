-- ================================================================
-- DEMO RESET: wipes every venue, court, tournament, booking and
-- payment record so the app shows a clean slate for a client demo.
--
-- Deletion order matters — several tables RESTRICT deletes of what
-- they reference:
--   payments        -> court_bookings / bookings / venues / tournament_teams
--   games           -> court_bookings
--   notifications   -> games (notifications.game_id has no cascade)
--   events          -> venues (events.venue_id has no cascade)
--   court_bookings  -> events (hosted_event_id has no cascade — the
--                     reverse direction of the line above, so events
--                     can't be deleted first either without this)
-- all of those must be cleared before the table they point at.
-- Everything else cascades automatically once its parent is deleted
-- (courts/court_hours/court_blocks/court_bookings from venues;
-- tournament_teams/tournament_team_players/tournament_matches/
-- tournament_announcements from tournaments; game_players from games;
-- game_groups/host_tools/notifications.event_id from events).
--
-- Does NOT touch: profiles/accounts, organizer<->vendor partnerships,
-- platform payment method config (payment_methods), non-venue "meetup"
-- events with no venue_id, or the legacy `bookings` (event_booking)
-- table — none of those are "venues or tournaments" data. Re-run
-- safely; it's a no-op once everything's already empty.
-- ================================================================

delete from public.payments;
delete from public.notifications where game_id is not null;
delete from public.games;

update public.court_bookings set hosted_event_id = null;
delete from public.events where venue_id is not null;

delete from public.tournaments;          -- cascades: tournament_teams, tournament_team_players,
                                          -- tournament_matches, tournament_announcements, notifications.tournament_id
delete from public.venues;               -- cascades: venue_staff, courts, court_hours, court_blocks, court_bookings

-- ── DONE ─────────────────────────────────────────────────────────
