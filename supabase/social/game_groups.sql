-- ================================================================
-- GAME GROUPS
--  • Every hosted game automatically gets its own group chat.
--  • Anyone who books a spot is added to that group.
--  • Requests to join a normal group need the owner's approval,
--    and that request lands in their notifications.
-- Safe to run multiple times. Run AFTER notifications.sql.
-- ================================================================

-- ── Link a group to the game that spawned it ────────────────────
alter table public.squads
  add column if not exists event_id uuid references public.events(id) on delete cascade;

create unique index if not exists squads_event_uniq
  on public.squads (event_id) where event_id is not null;

-- ================================================================
-- 1. Hosting a game creates its group, with the host as owner
-- ================================================================
create or replace function public.group_for_new_game()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_squad uuid;
begin
  insert into public.squads (creator_id, name, sport, description, event_id, unlisted)
  values (
    new.host_id,
    new.title,
    new.sport,
    'Group chat for this game. Everyone who joins lands here.',
    new.id,
    true                        -- game groups aren't listed in Browse
  )
  returning id into v_squad;

  insert into public.squad_members (squad_id, user_id, role)
  values (v_squad, new.host_id, 'owner')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_group_for_new_game on public.events;
create trigger trg_group_for_new_game
  after insert on public.events
  for each row execute function public.group_for_new_game();

-- ================================================================
-- 2. Booking a spot adds you to that game's group
-- ================================================================
create or replace function public.group_join_on_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_squad uuid;
  v_name  text;
begin
  if new.status <> 'confirmed' then return new; end if;

  select id into v_squad from public.squads where event_id = new.event_id;
  if v_squad is null then return new; end if;

  insert into public.squad_members (squad_id, user_id, role)
  values (v_squad, new.user_id, 'member')
  on conflict do nothing;

  -- Let the new member know the chat is waiting for them.
  select name into v_name from public.squads where id = v_squad;
  insert into public.notifications (user_id, kind, title, body, event_id)
  values (
    new.user_id, 'event',
    'You''re in the group for ' || coalesce(v_name, 'this game'),
    'Say hello and sort out the details with the rest of the players.',
    new.event_id
  );

  return new;
end;
$$;

drop trigger if exists trg_group_join_on_booking on public.bookings;
create trigger trg_group_join_on_booking
  after insert on public.bookings
  for each row execute function public.group_join_on_booking();

-- Leaving a game also leaves its group.
create or replace function public.group_leave_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_squad uuid;
begin
  if not (old.status = 'confirmed' and new.status <> 'confirmed') then return new; end if;
  select id into v_squad from public.squads where event_id = new.event_id;
  if v_squad is null then return new; end if;
  delete from public.squad_members
    where squad_id = v_squad and user_id = new.user_id and role <> 'owner';
  return new;
end;
$$;

drop trigger if exists trg_group_leave_on_cancel on public.bookings;
create trigger trg_group_leave_on_cancel
  after update on public.bookings
  for each row execute function public.group_leave_on_cancel();

-- ================================================================
-- 3. Join requests + approval
-- ================================================================
create table if not exists public.squad_requests (
  id         uuid primary key default gen_random_uuid(),
  squad_id   uuid not null references public.squads(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending','approved','denied')),
  created_at timestamptz not null default now(),
  unique (squad_id, user_id)
);

create index if not exists squad_requests_squad_idx
  on public.squad_requests (squad_id, status);

alter table public.squad_requests enable row level security;

drop policy if exists "own request insert"    on public.squad_requests;
drop policy if exists "see own or as owner"   on public.squad_requests;
drop policy if exists "owner decides"         on public.squad_requests;

create policy "own request insert"
  on public.squad_requests for insert with check (user_id = auth.uid());

create policy "see own or as owner"
  on public.squad_requests for select using (
    user_id = auth.uid()
    or exists (select 1 from public.squads s
               where s.id = squad_requests.squad_id and s.creator_id = auth.uid())
  );

create policy "owner decides"
  on public.squad_requests for update using (
    exists (select 1 from public.squads s
            where s.id = squad_requests.squad_id and s.creator_id = auth.uid())
  );

-- A new request notifies the group owner.
create or replace function public.notify_owner_on_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_group text;
  v_who   text;
begin
  select creator_id, name into v_owner, v_group
    from public.squads where id = new.squad_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;

  select coalesce(full_name, 'Someone') into v_who
    from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, kind, title, body, actor_id)
  values (
    v_owner, 'event',
    v_who || ' wants to join ' || coalesce(v_group, 'your group'),
    'Approve or decline from the group page.',
    new.user_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_on_request on public.squad_requests;
create trigger trg_notify_owner_on_request
  after insert on public.squad_requests
  for each row execute function public.notify_owner_on_request();

-- Approving adds the member and tells them.
create or replace function public.apply_request_decision()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group text;
begin
  if old.status <> 'pending' or new.status = 'pending' then return new; end if;
  select name into v_group from public.squads where id = new.squad_id;

  if new.status = 'approved' then
    insert into public.squad_members (squad_id, user_id, role)
    values (new.squad_id, new.user_id, 'member')
    on conflict do nothing;

    insert into public.notifications (user_id, kind, title, body)
    values (new.user_id, 'event',
            'You were added to ' || coalesce(v_group, 'the group'),
            'Jump in and say hello.');
  else
    insert into public.notifications (user_id, kind, title, body)
    values (new.user_id, 'event',
            'Your request to join ' || coalesce(v_group, 'a group') || ' wasn''t accepted',
            'You can still find other groups to join.');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_request_decision on public.squad_requests;
create trigger trg_apply_request_decision
  after update on public.squad_requests
  for each row execute function public.apply_request_decision();

-- ================================================================
-- 4. Backfill — groups for games that already exist
-- ================================================================
insert into public.squads (creator_id, name, sport, description, event_id, unlisted)
select e.host_id, e.title, e.sport,
       'Group chat for this game. Everyone who joins lands here.', e.id, true
from public.events e
where e.host_id is not null
  and not exists (select 1 from public.squads s where s.event_id = e.id);

insert into public.squad_members (squad_id, user_id, role)
select s.id, s.creator_id, 'owner'
from public.squads s
where s.event_id is not null
on conflict do nothing;

insert into public.squad_members (squad_id, user_id, role)
select s.id, b.user_id, 'member'
from public.squads s
join public.bookings b on b.event_id = s.event_id and b.status = 'confirmed'
where s.event_id is not null
on conflict do nothing;
