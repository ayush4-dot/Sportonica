-- ================================================================
-- Fix: cancel_tournament() was super_admin-only, leaving a vendor with
-- no way to recover from a mistake after publishing (update_tournament_draft
-- only allows edits while status = 'draft', so cancel-and-redraft is the
-- only escape hatch). Widen it to match tournaments.sql's stated intent:
-- the tournament's own venue manager, or a super_admin. Safe to re-run.
-- ================================================================
create or replace function public.cancel_tournament(p_id uuid, p_reason text)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'cancelled', cancel_reason = p_reason where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.cancel_tournament(uuid,text) to authenticated;
