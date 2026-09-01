-- ================================================================
-- HOST TOOLS: invites (host-paid spots) + editable game notes
-- Safe to run multiple times.
-- ================================================================

-- Optional free-text note a host can add to their game.
alter table public.events
  add column if not exists notes text;

-- ── Invites ─────────────────────────────────────────────────────
-- A host invites people by email. When the host is covering the
-- cost, paid_by_host stays true — that's the normal Kathmandu case
-- where the organiser books the court and collects cash later.
create table if not exists public.invites (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  email         text not null,
  invited_by    uuid not null references auth.users(id) on delete cascade,
  paid_by_host  boolean not null default true,
  status        text not null default 'invited'
                check (status in ('invited','accepted','declined')),
  created_at    timestamptz not null default now(),
  unique (event_id, email)
);

create index if not exists invites_event_idx on public.invites (event_id);
create index if not exists invites_email_idx on public.invites (lower(email));

alter table public.invites enable row level security;

drop policy if exists "host manages own invites"  on public.invites;
drop policy if exists "invitee reads own invite"   on public.invites;

-- The host can do anything with invites for their own games.
create policy "host manages own invites"
  on public.invites for all
  using (
    exists (
      select 1 from public.events e
      where e.id = invites.event_id and e.host_id = auth.uid()
    )
  );

-- An invited person can see their own invite (matched on email).
create policy "invitee reads own invite"
  on public.invites for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
