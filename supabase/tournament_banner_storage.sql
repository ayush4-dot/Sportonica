-- ================================================================
-- STORAGE: tournament banner images.
-- Public read (shown on public tournament cards/pages); owner-scoped
-- insert, keyed by the uploader's own auth.uid() folder — same shape as
-- payment-qr / host-qr in supabase/payments.sql & play_together.ts.
-- ================================================================
insert into storage.buckets (id, name, public)
  values ('tournament-banners', 'tournament-banners', true)
  on conflict (id) do nothing;

drop policy if exists tournament_banner_read on storage.objects;
drop policy if exists tournament_banner_owner_insert on storage.objects;

create policy tournament_banner_read on storage.objects for select
  using (bucket_id = 'tournament-banners');

create policy tournament_banner_owner_insert on storage.objects for insert
  with check (bucket_id = 'tournament-banners' and (storage.foldername(name))[1] = auth.uid()::text);
