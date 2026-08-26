-- ================================================================
-- Match edit audit log — who changed what and when, for organizers/
-- admins reviewing a match's history. Pulled from the bracket-rebuild
-- spec's tournament_match_audit idea, adapted onto the existing
-- manual match system (no auto-cascade, no separate rounds table —
-- those were explicitly declined) rather than a parallel rebuild.
-- Logging is added directly inside the existing mutation RPCs
-- (create_match, delete_match, record_match_result, set_match_time)
-- rather than a trigger, so each entry can carry a clear change_type.
-- Run any time. Safe to re-run.
-- ================================================================

create table if not exists public.tournament_match_audit (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.tournament_matches(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  changed_by  uuid references auth.users(id),
  change_type text not null check (change_type in ('created','deleted','result','schedule')),
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_match_audit_match on public.tournament_match_audit(match_id, created_at desc);

-- Same audience as everything else match-related: whoever manages the
-- tournament. Not public — this is an internal accountability log.
alter table public.tournament_match_audit enable row level security;
drop policy if exists tournament_match_audit_read on public.tournament_match_audit;
create policy tournament_match_audit_read on public.tournament_match_audit for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id
      and (public.is_tournament_organizer(t) or public.has_venue_access(t.venue_id) or public.is_super_admin())
  ));

create or replace function public.get_match_audit(p_match_id uuid)
returns setof public.tournament_match_audit
language sql stable security definer set search_path = public as $$
  select * from public.tournament_match_audit where match_id = p_match_id order by created_at desc;
$$;
grant execute on function public.get_match_audit(uuid) to authenticated;

-- ── create_match: log the new row ───────────────────────────────
create or replace function public.create_match(
  p_tournament_id uuid,
  p_stage         text,
  p_round         int,
  p_round_label   text,
  p_team_a_id     uuid,
  p_team_b_id     uuid default null,
  p_group_name    text default null
) returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_t   public.tournaments;
  v_row public.tournament_matches;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status not in ('registration_closed', 'live') then raise exception 'INVALID_TRANSITION'; end if;
  if p_stage not in ('group', 'league', 'knockout') then raise exception 'INVALID_STAGE'; end if;
  if p_round_label is null or length(trim(p_round_label)) = 0 then raise exception 'TITLE_REQUIRED'; end if;

  if not exists (
    select 1 from public.tournament_teams
    where id = p_team_a_id and tournament_id = p_tournament_id and status = 'confirmed'
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_team_b_id is not null then
    if p_team_a_id = p_team_b_id then raise exception 'SAME_TEAM'; end if;
    if not exists (
      select 1 from public.tournament_teams
      where id = p_team_b_id and tournament_id = p_tournament_id and status = 'confirmed'
    ) then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  end if;

  insert into public.tournament_matches (
    tournament_id, stage, round, round_label, group_name, team_a_id, team_b_id, status
  ) values (
    p_tournament_id, p_stage, p_round, trim(p_round_label), nullif(trim(coalesce(p_group_name, '')), ''),
    p_team_a_id, p_team_b_id, 'unscheduled'
  ) returning * into v_row;

  if v_t.status = 'registration_closed' then
    update public.tournaments set status = 'live' where id = p_tournament_id;
  end if;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, new_value)
  values (v_row.id, p_tournament_id, auth.uid(), 'created', to_jsonb(v_row));

  return v_row;
end;
$$;
grant execute on function public.create_match(uuid,text,int,text,uuid,uuid,text) to authenticated;

-- ── delete_match: log the removed row ───────────────────────────
create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status in ('completed', 'walkover') then raise exception 'MATCH_ALREADY_DONE'; end if;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'deleted', to_jsonb(v_match));

  delete from public.tournament_matches where id = p_match_id;
end;
$$;
grant execute on function public.delete_match(uuid) to authenticated;

-- ── record_match_result: log score/status change ────────────────
create or replace function public.record_match_result(
  p_match_id uuid,
  p_score_a int default null,
  p_score_b int default null,
  p_winner_team_id uuid default null,
  p_score_a_et int default null,
  p_score_b_et int default null,
  p_score_a_pens int default null,
  p_score_b_pens int default null
)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_before public.tournament_matches;
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_winner uuid;
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
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;

  if p_winner_team_id is not null then
    if p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then raise exception 'INVALID_WINNER'; end if;
    v_winner := p_winner_team_id;
    update public.tournament_matches
      set status = 'walkover', winner_team_id = v_winner,
          score_a = null, score_b = null, score_a_et = null, score_b_et = null, score_a_pens = null, score_b_pens = null
      where id = p_match_id returning * into v_match;
  else
    if p_score_a is null or p_score_b is null then raise exception 'SCORES_REQUIRED'; end if;

    if p_score_a <> p_score_b then
      v_winner := case when p_score_a > p_score_b then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_et is not null and p_score_b_et is not null and p_score_a_et <> p_score_b_et then
      v_winner := case when p_score_a_et > p_score_b_et then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_pens is not null and p_score_b_pens is not null and p_score_a_pens <> p_score_b_pens then
      v_winner := case when p_score_a_pens > p_score_b_pens then v_match.team_a_id else v_match.team_b_id end;
    else
      v_winner := null;
    end if;

    if v_winner is null and v_t.format <> 'league' and v_match.stage <> 'group' then
      raise exception 'KNOCKOUT_CANNOT_DRAW';
    end if;

    update public.tournament_matches
      set status = 'completed', score_a = p_score_a, score_b = p_score_b,
          score_a_et = p_score_a_et, score_b_et = p_score_b_et,
          score_a_pens = p_score_a_pens, score_b_pens = p_score_b_pens,
          winner_team_id = v_winner
      where id = p_match_id returning * into v_match;
  end if;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'result', to_jsonb(v_before), to_jsonb(v_match));

  if v_winner is not null and v_match.next_match_id is not null then
    perform public.propagate_match_winner(p_match_id, v_winner);
  end if;

  return v_match;
end;
$$;
grant execute on function public.record_match_result(uuid,int,int,uuid,int,int,int,int) to authenticated;

-- ── set_match_time: log schedule change ─────────────────────────
create or replace function public.set_match_time(p_match_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
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
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  update public.tournament_matches set starts_at = p_starts_at, ends_at = p_ends_at, status = case
      when status = 'unscheduled' and p_starts_at is not null then 'scheduled'
      when status = 'scheduled' and p_starts_at is null then 'unscheduled'
      else status
    end
    where id = p_match_id
    returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'schedule', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.set_match_time(uuid,timestamptz,timestamptz) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
