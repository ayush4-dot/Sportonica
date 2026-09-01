-- ================================================================
-- NOTIFICATIONS
-- Safe to run multiple times.
-- Creates a per-user notifications table plus triggers that fire
-- when someone joins a hosted game, when a booking is cancelled,
-- and when a game is running low on spots.
-- ================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('joined','left','spots_needed','hosted','event')),
  title       text not null,
  body        text,
  event_id    uuid references public.events(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- ── RLS: a user sees and updates only their own notifications ──
alter table public.notifications enable row level security;

drop policy if exists "own notifications select" on public.notifications;
drop policy if exists "own notifications update" on public.notifications;

create policy "own notifications select"
  on public.notifications for select using (user_id = auth.uid());

create policy "own notifications update"
  on public.notifications for update using (user_id = auth.uid());

-- Triggers insert rows as SECURITY DEFINER, bypassing RLS for writes.

-- ================================================================
-- Trigger: someone joins (or leaves) a game -> notify the host
-- ================================================================
create or replace function public.notify_host_on_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_host   uuid;
  v_title  text;
  v_sport  text;
  v_joiner text;
begin
  select host_id, sport into v_host, v_sport from public.events where id = new.event_id;
  if v_host is null then return new; end if;

  -- Don't notify the host about their own join.
  if new.user_id = v_host then return new; end if;

  select coalesce(full_name, 'A player') into v_joiner
    from public.profiles where id = new.user_id;

  if tg_op = 'INSERT' and new.status = 'confirmed' then
    insert into public.notifications (user_id, kind, title, body, event_id, actor_id)
    values (v_host, 'joined',
            v_joiner || ' joined your ' || coalesce(v_sport, 'game'),
            'Tap to see who''s coming.',
            new.event_id, new.user_id);

    -- If the game is now full, tell the host.
    if (select slots_remaining from public.events_with_counts where id = new.event_id) <= 0 then
      insert into public.notifications (user_id, kind, title, body, event_id)
      values (v_host, 'event',
              'Your ' || coalesce(v_sport, 'game') || ' is full',
              'All spots are taken. See you on the court.',
              new.event_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_host_on_booking on public.bookings;
create trigger trg_notify_host_on_booking
  after insert on public.bookings
  for each row execute function public.notify_host_on_booking();

-- ================================================================
-- Trigger: a booking is cancelled -> notify host, and flag spots
-- ================================================================
create or replace function public.notify_host_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_host  uuid;
  v_sport text;
  v_left  int;
begin
  if not (old.status = 'confirmed' and new.status <> 'confirmed') then
    return new;
  end if;

  select host_id, sport into v_host, v_sport from public.events where id = new.event_id;
  if v_host is null or new.user_id = v_host then return new; end if;

  insert into public.notifications (user_id, kind, title, body, event_id, actor_id)
  values (v_host, 'left',
          'A player dropped from your ' || coalesce(v_sport, 'game'),
          'A spot just opened up.',
          new.event_id, new.user_id);

  return new;
end;
$$;

drop trigger if exists trg_notify_host_on_cancel on public.bookings;
create trigger trg_notify_host_on_cancel
  after update on public.bookings
  for each row execute function public.notify_host_on_cancel();

-- ================================================================
-- Helper: mark all of the current user's notifications read
-- ================================================================
create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read = true
  where user_id = auth.uid() and read = false;
$$;

grant execute on function public.mark_notifications_read() to authenticated;
