-- ================================================================
-- Make group notifications tappable.
-- Adds squad_id to notifications so the bell can open the chat.
-- Run AFTER notifications.sql and game_groups.sql.
-- ================================================================

alter table public.notifications
  add column if not exists squad_id uuid references public.squads(id) on delete cascade;

-- ── Approval / decline now carry the group id ───────────────────
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

    insert into public.notifications (user_id, kind, title, body, squad_id)
    values (new.user_id, 'event',
            'You''re in — welcome to ' || coalesce(v_group, 'the group'),
            'Your request was approved. Tap to open the chat.',
            new.squad_id);
  else
    insert into public.notifications (user_id, kind, title, body)
    values (new.user_id, 'event',
            'Your request to join ' || coalesce(v_group, 'a group') || ' wasn''t accepted',
            'You can still find other groups to join.');
  end if;
  return new;
end;
$$;

-- ── The owner's "wants to join" notification links to the group ──
create or replace function public.notify_owner_on_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_group text; v_who text;
begin
  select creator_id, name into v_owner, v_group
    from public.squads where id = new.squad_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;

  select coalesce(full_name, 'Someone') into v_who
    from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, kind, title, body, actor_id, squad_id)
  values (v_owner, 'event',
          v_who || ' wants to join ' || coalesce(v_group, 'your group'),
          'Tap to approve or decline.',
          new.user_id, new.squad_id);
  return new;
end;
$$;

-- ── Auto-added-to-game-group notification links to the chat ──────
create or replace function public.group_join_on_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_squad uuid; v_name text;
begin
  if new.status <> 'confirmed' then return new; end if;

  select id, name into v_squad, v_name
    from public.squads where event_id = new.event_id;
  if v_squad is null then return new; end if;

  insert into public.squad_members (squad_id, user_id, role)
  values (v_squad, new.user_id, 'member')
  on conflict do nothing;

  insert into public.notifications (user_id, kind, title, body, event_id, squad_id)
  values (new.user_id, 'event',
          'You''re in the group for ' || coalesce(v_name, 'this game'),
          'Say hello and sort out the details with the other players.',
          new.event_id, v_squad);

  return new;
end;
$$;
