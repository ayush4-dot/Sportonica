-- ================================================================
-- Per-player match stats (goals, man-of-the-match) + linking a
-- walk-in roster spot to a real account once someone signs up or
-- logs in with the same phone/email a walk-in team member was
-- registered with — their goals/performance then show up on their
-- own profile automatically, no manual re-entry.
-- Run any time. Safe to re-run.
-- ================================================================

create table if not exists public.tournament_match_player_stats (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references public.tournament_matches(id) on delete cascade,
  team_player_id uuid not null references public.tournament_team_players(id) on delete cascade,
  goals          int not null default 0 check (goals >= 0),
  is_mom         boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (match_id, team_player_id)
);
create index if not exists idx_tmps_match on public.tournament_match_player_stats(match_id);
create index if not exists idx_tmps_team_player on public.tournament_match_player_stats(team_player_id);

drop trigger if exists tmps_touch on public.tournament_match_player_stats;
create trigger tmps_touch before update on public.tournament_match_player_stats
  for each row execute function public.set_updated_at();

-- Same audience as the roster itself (tournament_team_players_read):
-- a player on the team, that team's own record via captain/roster,
-- whoever manages the tournament, or Super Admin. No wider public
-- exposure than what a team's roster already has.
alter table public.tournament_match_player_stats enable row level security;
drop policy if exists tmps_read on public.tournament_match_player_stats;
create policy tmps_read on public.tournament_match_player_stats for select
  using (exists (
    select 1 from public.tournament_team_players tp
    join public.tournament_teams tt on tt.id = tp.team_id
    where tp.id = team_player_id
      and (
        tp.user_id = auth.uid()
        or tt.captain_id = auth.uid()
        or exists (select 1 from public.tournaments t where t.id = tt.tournament_id and public.has_venue_access(t.venue_id))
        or exists (select 1 from public.tournaments t where t.id = tt.tournament_id and public.is_tournament_organizer(t))
        or public.is_super_admin()
      )
  ));

-- ── record_match_player_stats: organizer/venue-manager/admin only.
-- p_stats is a jsonb array of {team_player_id, goals, is_mom}. Upserts
-- every row it's given; doesn't touch stats for players not included. ──
create or replace function public.record_match_player_stats(p_match_id uuid, p_stats jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t     public.tournaments;
  v_stat  jsonb;
  v_tp_id uuid;
  v_valid boolean;
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
  if v_match.status <> 'completed' then raise exception 'MATCH_NOT_COMPLETED'; end if;

  for v_stat in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb))
  loop
    v_tp_id := (v_stat->>'team_player_id')::uuid;

    select exists (
      select 1 from public.tournament_team_players
      where id = v_tp_id and team_id in (v_match.team_a_id, v_match.team_b_id)
    ) into v_valid;
    if not v_valid then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

    insert into public.tournament_match_player_stats (match_id, team_player_id, goals, is_mom)
    values (p_match_id, v_tp_id, coalesce((v_stat->>'goals')::int, 0), coalesce((v_stat->>'is_mom')::boolean, false))
    on conflict (match_id, team_player_id) do update
      set goals = excluded.goals, is_mom = excluded.is_mom, updated_at = now();
  end loop;
end;
$$;
grant execute on function public.record_match_player_stats(uuid,jsonb) to authenticated;

-- ── get_player_scorecard: aggregate career stats for one linked
-- account, across every tournament they've actually played. Safe to
-- expose publicly on a profile page — no more revealing than a total
-- games-played counter already shown there. ────────────────────────
create or replace function public.get_player_scorecard(p_user_id uuid)
returns table (
  goals              bigint,
  matches_played     bigint,
  tournaments_played bigint,
  mom_count          bigint
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(s.goals), 0)                          as goals,
    count(distinct s.match_id)                         as matches_played,
    count(distinct tt.tournament_id)                   as tournaments_played,
    count(*) filter (where s.is_mom)                   as mom_count
  from public.tournament_match_player_stats s
  join public.tournament_team_players tp on tp.id = s.team_player_id
  join public.tournament_teams tt on tt.id = tp.team_id
  where tp.user_id = p_user_id;
$$;
grant execute on function public.get_player_scorecard(uuid) to authenticated, anon;

-- ── claim_guest_tournament_entries: called after sign-in/sign-up (and
-- after saving a profile phone number) — links any walk-in roster spot
-- whose guest_phone/guest_email matches the caller's own auth phone/
-- email or profile phone, so their history becomes theirs. Phone
-- comparison uses the last 10 digits so a "98XXXXXXXX" entered by an
-- admin at the desk still matches a "+97798XXXXXXXX" account phone. ──
create or replace function public.claim_guest_tournament_entries()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
  v_email text;
  v_count int;
begin
  select au.phone, au.email into v_phone, v_email from auth.users au where au.id = auth.uid();
  if v_phone is null or length(trim(v_phone)) = 0 then
    select phone into v_phone from public.profiles where id = auth.uid();
  end if;

  update public.tournament_team_players
  set user_id = auth.uid()
  where user_id is null
    and (
      (v_phone is not null and guest_phone is not null
        and right(regexp_replace(guest_phone, '\D', '', 'g'), 10) = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
        and length(regexp_replace(guest_phone, '\D', '', 'g')) >= 7)
      or (v_email is not null and guest_email is not null and lower(trim(guest_email)) = lower(trim(v_email)))
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.claim_guest_tournament_entries() to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
