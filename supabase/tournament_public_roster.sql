-- ================================================================
-- Fix: the public event page's Teams tab ("tap to view squad") always
-- showed "No roster on file yet." even when a roster genuinely
-- existed, because it called getTeamRoster() — the same function used
-- for the captain's own management view and the admin's match-stat
-- entry — which reads tournament_team_players directly under RLS.
-- That table has no public-read policy at all (deliberately: it holds
-- guest_phone/guest_email for walk-in players), so an anonymous
-- visitor's query is silently filtered down to zero rows by RLS —
-- no error, just an empty result.
--
-- Rather than widen the raw table's RLS (which would leak phone/email
-- to any visitor), add a security-definer function that returns only
-- what a public squad viewer needs — id, name, role — nothing else,
-- and only for confirmed teams. Run any time. Safe to re-run.
-- ================================================================

create or replace function public.get_team_roster_public(p_team_id uuid)
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select
    tp.id,
    coalesce(p.full_name, p.name, p.username, tp.guest_name, 'Player') as name,
    tp.role
  from public.tournament_team_players tp
  join public.tournament_teams tt on tt.id = tp.team_id
  left join public.profiles p on p.id = tp.user_id
  where tp.team_id = p_team_id and tt.status = 'confirmed'
  order by (tp.role = 'captain') desc, tp.joined_at asc;
$$;
grant execute on function public.get_team_roster_public(uuid) to anon, authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
