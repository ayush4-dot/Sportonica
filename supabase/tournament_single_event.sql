-- ================================================================
-- Sportonica — Tournaments: 'single_event' format. Run AFTER
-- tournament_fixtures.sql. Safe to re-run.
--
-- Folds the old vendor "Events" feature (/admin/events, /platform/events —
-- venue_event/platform_event rows in the legacy `events` table) into
-- Tournaments as a lightweight format, instead of running two parallel
-- systems. A "single event" is structurally just a tournament where every
-- team's roster is capped at one player (captain-only, no bracket) — so
-- registration, payment, roster and notifications are already handled by
-- register_team()/the existing payment RPCs unchanged. The only new piece
-- is a lifecycle step that skips fixture generation entirely.
--
-- Explicitly NOT touched: the legacy `events`/`bookings` tables, the
-- "need players?" court-booking toggle (maybe_publish_hosted_event(),
-- payments.sql), and Play Together (games/game_players) — all unrelated
-- to this merge and left exactly as they are. Existing venue_event/
-- platform_event rows are not migrated; they keep showing wherever they
-- do today until they age past their date.
-- ================================================================

create or replace function pg_temp.drop_check_constraints(p_table text, p_column text)
returns void language plpgsql as $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where nsp.nspname = 'public' and rel.relname = p_table
      and con.contype = 'c' and att.attname = p_column
  loop
    execute format('alter table public.%I drop constraint %I', p_table, r.conname);
  end loop;
end;
$$;

select pg_temp.drop_check_constraints('tournaments', 'format');
alter table public.tournaments add constraint tournaments_format_check
  check (format in ('knockout','league','group_knockout','single_event'));

drop function pg_temp.drop_check_constraints(text, text);

-- registration_closed -> live, no fixtures — mirrors
-- close_tournament_registration()'s shape (tournaments.sql).
create or replace function public.start_single_event(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.format <> 'single_event' then raise exception 'WRONG_FORMAT'; end if;
  if v_row.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'live' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.start_single_event(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
