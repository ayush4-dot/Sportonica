-- ================================================================
-- DEMO RESET: wipes every venue, court, tournament, booking and
-- payment record so the app shows a clean slate for a client demo.
--
-- Deletion order matters — several tables RESTRICT deletes of what
-- they reference (payments -> court_bookings/bookings/venues/
-- tournament_teams; games -> court_bookings), so those must go first.
-- Everything else cascades automatically once its parent is deleted
-- (courts/court_hours/court_blocks/court_bookings from venues;
-- tournament_teams/tournament_team_players/tournament_matches/
-- tournament_announcements from tournaments; game_players from games).
--
-- Does NOT touch: profiles/accounts, organizer<->vendor partnerships,
-- platform payment method config (payment_methods), or the legacy
-- `bookings` (event_booking) table — none of those are "venues or
-- tournaments" data. Re-run safely; it's a no-op once everything's
-- already empty.
-- ================================================================

delete from public.payments;
delete from public.games;

delete from public.tournaments;          -- cascades: tournament_teams, tournament_team_players,
                                          -- tournament_matches, tournament_announcements, notifications.tournament_id
delete from public.venues;               -- cascades: venue_staff, courts, court_hours, court_blocks, court_bookings

-- ── DONE ─────────────────────────────────────────────────────────
