-- ================================================================
-- Edit an existing match's teams (only before it's played) — the one
-- gap in the manual fixtures system: today you can create, score,
-- schedule, or delete a match, but never fix a wrong team pick after
-- the fact. Audited like every other match edit.
--
-- Deliberately NOT building: next_match_id auto-wiring, cascade
-- propagation, or a cascade-confirmation flow. Those assume a fixed
-- bracket tree, which a fully-manual, admin-built fixture list
-- doesn't have — round 2 might not even be created yet when round 1
-- finishes, and its match count/shape is whatever the admin decides.
-- The client instead offers "winner of match X" as a one-click option
-- in the team pickers (pure UI, reads matches already on the page —
-- no new RPC needed for that part), so building round 2 from round
-- 1's results is fast without pretending the system knows the whole
-- tree in advance.
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_match_audit drop constraint if exists tournament_match_audit_change_type_check;
alter table public.tournament_match_audit add constraint tournament_match_audit_change_type_check
  check (change_type in ('created','deleted','result','schedule','teams'));

create or replace function public.update_match_teams(p_match_id uuid, p_team_a_id uuid, p_team_b_id uuid default null)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status in ('completed', 'walkover') then raise exception 'MATCH_ALREADY_DONE'; end if;

  if not exists (
    select 1 from public.tournament_teams
    where id = p_team_a_id and tournament_id = v_match.tournament_id and status = 'confirmed'
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_team_b_id is not null then
    if p_team_a_id = p_team_b_id then raise exception 'SAME_TEAM'; end if;
    if not exists (
      select 1 from public.tournament_teams
      where id = p_team_b_id and tournament_id = v_match.tournament_id and status = 'confirmed'
    ) then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  end if;

  update public.tournament_matches set team_a_id = p_team_a_id, team_b_id = p_team_b_id
    where id = p_match_id returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'teams', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.update_match_teams(uuid,uuid,uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
