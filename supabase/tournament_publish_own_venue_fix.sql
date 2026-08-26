-- ================================================================
-- Fix: publish_tournament()'s completeness check required venue_id to
-- be non-null unconditionally — but an "own venue" tournament (see
-- organizer_approval_and_own_venue.sql) legitimately has venue_id = null
-- and uses own_venue_name instead, so it could never pass this check and
-- always failed with "Fill in the required fields before publishing"
-- regardless of what was actually filled in. Run any time. Safe to re-run.
-- ================================================================

create or replace function public.publish_tournament(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;
  if v_row.venue_booking_status <> 'confirmed' then raise exception 'VENUE_NOT_CONFIRMED'; end if;

  if v_row.name is null or v_row.sport is null
     or (v_row.venue_id is null and v_row.own_venue_name is null)
     or v_row.max_teams is null or v_row.min_players_per_team is null or v_row.max_players_per_team is null
  then
    raise exception 'INCOMPLETE_TOURNAMENT';
  end if;

  update public.tournaments
    set status = case when public.is_super_admin() then 'published' else 'pending_approval' end
    where id = p_id returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.publish_tournament(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
