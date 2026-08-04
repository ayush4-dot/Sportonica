-- ================================================================
-- FRIENDS + END-TO-END ENCRYPTED DIRECT MESSAGES
--  • Friend requests: send / accept / decline, Facebook-style.
--  • Once friends, either side can open a private 1:1 conversation.
--  • Message content is client-side encrypted (AES-GCM via ECDH-derived
--    key) BEFORE it ever reaches this database — direct_messages.ciphertext
--    is opaque to the server, to Supabase, and to anyone with DB access.
--    See src/lib/crypto/ for the client-side half of this.
-- Safe to run multiple times. Run AFTER notifications.sql.
-- ================================================================

-- ================================================================
-- 1. Friend requests
-- ================================================================
create table if not exists public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','accepted','declined')),
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friend_requests_addressee_idx
  on public.friend_requests (addressee_id, status);
create index if not exists friend_requests_requester_idx
  on public.friend_requests (requester_id, status);

alter table public.friend_requests enable row level security;

drop policy if exists "own request insert" on public.friend_requests;
drop policy if exists "see own requests"   on public.friend_requests;
drop policy if exists "addressee decides"  on public.friend_requests;
drop policy if exists "participants delete" on public.friend_requests;

create policy "own request insert"
  on public.friend_requests for insert with check (requester_id = auth.uid());

create policy "see own requests"
  on public.friend_requests for select using (auth.uid() in (requester_id, addressee_id));

create policy "addressee decides"
  on public.friend_requests for update using (addressee_id = auth.uid());

-- Covers: addressee declining (delete instead of leaving a permanent
-- 'declined' row on the unique constraint), requester cancelling a
-- pending request, and either side unfriending an accepted one.
create policy "participants delete"
  on public.friend_requests for delete using (auth.uid() in (requester_id, addressee_id));

-- Are two users friends? (accepted request, either direction)
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

-- A new request notifies the addressee.
create or replace function public.notify_on_friend_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text;
begin
  select coalesce(full_name, 'Someone') into v_who from public.profiles where id = new.requester_id;
  insert into public.notifications (user_id, kind, title, body, actor_id)
  values (new.addressee_id, 'friend_request',
          v_who || ' sent you a friend request',
          'Accept to start chatting.',
          new.requester_id);
  return new;
end;
$$;

drop trigger if exists trg_notify_on_friend_request on public.friend_requests;
create trigger trg_notify_on_friend_request
  after insert on public.friend_requests
  for each row execute function public.notify_on_friend_request();

-- Accepting notifies the original requester.
create or replace function public.notify_on_friend_accept()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text;
begin
  if old.status = new.status or new.status <> 'accepted' then return new; end if;
  select coalesce(full_name, 'Someone') into v_who from public.profiles where id = new.addressee_id;
  insert into public.notifications (user_id, kind, title, body, actor_id)
  values (new.requester_id, 'friend_accepted',
          v_who || ' accepted your friend request',
          'Say hello!',
          new.addressee_id);
  return new;
end;
$$;

drop trigger if exists trg_notify_on_friend_accept on public.friend_requests;
create trigger trg_notify_on_friend_accept
  after update on public.friend_requests
  for each row execute function public.notify_on_friend_accept();

-- ================================================================
-- 2. Conversations (one row per friend pair)
-- ================================================================
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references auth.users(id) on delete cascade,
  user_b     uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

alter table public.conversations enable row level security;

drop policy if exists "participants select" on public.conversations;
drop policy if exists "friends can create"  on public.conversations;

create policy "participants select"
  on public.conversations for select using (auth.uid() in (user_a, user_b));

-- Unfriending later does NOT retroactively hide an existing conversation —
-- this only gates creating a *new* one. Message RLS below checks
-- participancy, not live friendship status.
create policy "friends can create"
  on public.conversations for insert with check (
    auth.uid() in (user_a, user_b) and public.are_friends(user_a, user_b)
  );

-- Normalizes the (user_a, user_b) ordering and upserts, so the app layer
-- never has to deal with the `user_a < user_b` constraint directly.
create or replace function public.get_or_create_conversation(other_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_a  uuid;
  v_b  uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'UNAUTHORIZED'; end if;
  if v_me = other_id then raise exception 'Cannot start a conversation with yourself'; end if;
  if not public.are_friends(v_me, other_id) then raise exception 'NOT_FRIENDS'; end if;

  v_a := least(v_me, other_id);
  v_b := greatest(v_me, other_id);

  insert into public.conversations (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;

  select id into v_id from public.conversations where user_a = v_a and user_b = v_b;
  return v_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- ================================================================
-- 3. Direct messages — ciphertext only, server never sees plaintext
-- ================================================================
create table if not exists public.direct_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  ciphertext      text not null,   -- base64 AES-GCM output
  iv              text not null,   -- base64 nonce, unique per message
  created_at      timestamptz not null default now()
);

create index if not exists direct_messages_conv_idx
  on public.direct_messages (conversation_id, created_at);

alter table public.direct_messages enable row level security;

drop policy if exists "read own conversation"     on public.direct_messages;
drop policy if exists "send in own conversation"  on public.direct_messages;

create policy "read own conversation"
  on public.direct_messages for select using (
    exists (select 1 from public.conversations c
            where c.id = direct_messages.conversation_id
              and auth.uid() in (c.user_a, c.user_b))
  );

create policy "send in own conversation"
  on public.direct_messages for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.conversations c
                where c.id = direct_messages.conversation_id
                  and auth.uid() in (c.user_a, c.user_b))
  );

-- Realtime delivery, same mechanism SquadChat already relies on for
-- squad_messages. Guarded so re-running this file doesn't error.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- ================================================================
-- 4. Public key directory — one ECDH public key per user
-- ================================================================
create table if not exists public.user_keys (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  public_key text not null,   -- JWK, JSON-encoded
  created_at timestamptz not null default now()
);

alter table public.user_keys enable row level security;

drop policy if exists "public read" on public.user_keys;
drop policy if exists "own upsert"  on public.user_keys;
drop policy if exists "own update"  on public.user_keys;

-- Public keys are meant to be publicly readable — that's the point.
create policy "public read"
  on public.user_keys for select using (true);

create policy "own upsert"
  on public.user_keys for insert with check (user_id = auth.uid());

create policy "own update"
  on public.user_keys for update using (user_id = auth.uid());

-- ================================================================
-- 5. Per-conversation read state (drives unread badges — deliberately
--    NOT a notification row per message, same restraint squad chat uses)
-- ================================================================
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_reads enable row level security;

drop policy if exists "own reads select" on public.conversation_reads;
drop policy if exists "own reads upsert" on public.conversation_reads;
drop policy if exists "own reads update" on public.conversation_reads;

create policy "own reads select"
  on public.conversation_reads for select using (user_id = auth.uid());

create policy "own reads upsert"
  on public.conversation_reads for insert with check (user_id = auth.uid());

create policy "own reads update"
  on public.conversation_reads for update using (user_id = auth.uid());

-- ================================================================
-- 6. Wire friend requests + DMs into the existing notification bell
--    (mirrors how squad_id was added post-hoc in group_links.sql)
-- ================================================================
alter table public.notifications
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined','left','spots_needed','hosted','event','friend_request','friend_accepted'));
