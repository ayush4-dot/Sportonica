-- ================================================================
-- TOURNAMENT PLAYER CLAIM — expose whether a roster spot is linked to
-- a real account, so the public Teams tab can prompt an unlinked
-- (walk-in) player to sign in and claim their stats. The actual
-- linking already exists and already runs automatically on sign-in
-- (claim_guest_tournament_entries(), called from AppHeader.tsx) —
-- this just surfaces which names still need it, without leaking the
-- guest_phone/guest_email themselves (those stay private).
-- Run AFTER tournaments.sql. Safe to re-run.
-- ================================================================
drop function if exists public.get_team_roster_public(uuid);
create or replace function public.get_team_roster_public(p_team_id uuid)
returns table (id uuid, name text, role text, is_linked boolean)
language sql stable security definer set search_path = public as $$
  select
    tp.id,
    coalesce(p.full_name, p.name, p.username, tp.guest_name, 'Player') as name,
    tp.role,
    tp.user_id is not null as is_linked
  from public.tournament_team_players tp
  join public.tournament_teams tt on tt.id = tp.team_id
  left join public.profiles p on p.id = tp.user_id
  where tp.team_id = p_team_id and tt.status = 'confirmed'
  order by (tp.role = 'captain') desc, tp.joined_at asc;
$$;
grant execute on function public.get_team_roster_public(uuid) to anon, authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
