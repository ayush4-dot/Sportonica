-- ================================================================
-- Fix: public.book_court() has THREE overloads live in production,
-- not one. Run this once in the Supabase SQL Editor — safe to re-run.
--
-- admin_schema.sql, payments.sql, and booking_phone.sql each declared
-- book_court() with a different, growing parameter list (6, then 10,
-- then 11 params) using `create or replace function`. That only
-- replaces a function whose signature is unchanged — a different
-- parameter list creates a SEPARATE overload alongside the old one
-- instead of superseding it. None of those three files ever dropped
-- the earlier version first, so all three accumulated in the database.
--
-- Confirmed directly against production: calling book_court() with
-- just the original 6 named args now fails with "Could not choose the
-- best candidate function" between all three overloads, since the
-- 10-arg and 11-arg versions both accept the same 6 args via their
-- trailing defaults. Named-argument calls from the app (which always
-- pass all 11 args, including p_phone) still resolve fine — but the
-- POSITIONAL call inside create_play_together_game() in
-- play_together.sql ("public.book_court(p_court_id, p_starts_at,
-- p_ends_at, auth.uid(), null, 'platform')", 6 args, no names) hits
-- the ambiguity on every single call, which is why every attempt to
-- host a Play Together game has been failing with a 500.
--
-- Fix: drop the two stale overloads. Only booking_phone.sql's 11-param
-- version (the current, correct one — includes p_phone) is kept.
-- ================================================================

drop function if exists public.book_court(uuid, timestamptz, timestamptz, uuid, text, text);
drop function if exists public.book_court(uuid, timestamptz, timestamptz, uuid, text, text, integer, text, boolean, text);

-- ── DONE ─────────────────────────────────────────────────────────
