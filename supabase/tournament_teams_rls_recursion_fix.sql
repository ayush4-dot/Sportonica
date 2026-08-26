-- ================================================================
-- Fix: "infinite recursion detected in policy for relation
-- tournament_teams" — a genuine circular RLS dependency that's been
-- latent since tournaments.sql (Phase 1), not something introduced by
-- the later organizer/own-venue work:
--
--   tournament_teams_read_own (on tournament_teams) subqueries
--   tournament_team_players → tournament_team_players_read (on
--   tournament_team_players) subqueries tournament_teams → Postgres
--   has to re-enter tournament_teams' own RLS to evaluate that subquery,
--   which requires evaluating tournament_teams_read_own again, forever.
--
-- Standard Postgres fix (already used in this codebase for exactly this
-- reason — see has_venue_access()/is_super_admin() in admin_schema.sql/
-- payments.sql): move the cross-table check into a SECURITY DEFINER
-- function. Such a function runs as its owner (the Postgres superuser
-- role in Supabase), which bypasses RLS entirely — so calling it from
-- tournament_teams' policy no longer re-triggers
-- tournament_team_players' user-facing RLS at all, breaking the cycle
-- from every direction a query can enter it.
-- Run any time. Safe to re-run.
-- ================================================================

create or replace function public.user_on_team_roster(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_team_players
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

drop policy if exists tournament_teams_read_own on public.tournament_teams;
create policy tournament_teams_read_own on public.tournament_teams for select
  using (captain_id = auth.uid() or public.user_on_team_roster(id));

-- ── DONE ─────────────────────────────────────────────────────────
