-- ================================================================
-- Sportonica — "Play Together" Phase 3: a second payment option.
-- Run this whole file in the Supabase SQL Editor, AFTER
-- play_together_payments.sql. Safe to re-run.
--
-- Until now, an approved player had exactly one path out of
-- 'payment_pending': pay the host via QR/eSewa/Khalti/bank transfer and
-- upload proof for the host to verify. This adds the original Play
-- Together model — pay the host in cash at the venue — as an explicit
-- second choice, alongside the online-with-proof path, instead of
-- replacing it:
--
--   payment_pending
--     -> [player uploads proof]        -> payment_verification_pending -> joined
--     -> [player picks "pay at venue"] -> joined directly (no proof, no
--                                          host verification — the host
--                                          collects in person and marks
--                                          it collected via the existing
--                                          contribution_status toggle)
--
-- The 2-hour deadline still applies either way: choosing cash still has
-- to happen inside the window, exactly like submitting proof does — this
-- is what stops an approved-but-unresponsive player from holding a spot
-- indefinitely. Never trust the client's countdown; re-checked here
-- server-side before acting.
-- ================================================================

create or replace function public.choose_play_together_cash_payment(p_game_player_id uuid)
returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_row         public.game_players;
  v_game_status text;
begin
  select gp.* into v_row from public.game_players gp where gp.id = p_game_player_id for update of gp;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  if v_row.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;

  if v_row.status not in ('payment_pending', 'payment_rejected') then
    raise exception 'INVALID_PAYMENT_STATE';
  end if;

  select g.status into v_game_status from public.games g where g.id = v_row.game_id;
  if v_game_status <> 'published' then raise exception 'GAME_CANCELLED'; end if;

  -- Same "expire in place, don't raise" pattern as
  -- submit_play_together_payment() — raising here would roll back the
  -- expiry itself. The caller (chooseCashPaymentAtVenue() in
  -- src/lib/playTogether/actions.ts) detects status = 'expired' on the
  -- returned row and surfaces the friendly message.
  if v_row.payment_deadline is null or now() >= v_row.payment_deadline then
    update public.game_players set status = 'expired', expired_at = now()
      where id = p_game_player_id returning * into v_row;

    insert into public.notifications (user_id, kind, title, body, game_id)
    select r2.user_id, 'game_payment_expired', 'Payment window expired',
      format('Your payment window expired. Your request to join the %s game was cancelled because payment wasn''t completed in time.', g2.sport),
      r2.game_id
    from public.game_players r2 join public.games g2 on g2.id = r2.game_id where r2.id = p_game_player_id;
    insert into public.notifications (user_id, kind, title, body, game_id, actor_id)
    select g2.host_id, 'game_host_payment_expired', 'Player payment expired',
      format('A player''s payment window for your %s game expired before they paid.', g2.sport),
      r2.game_id, r2.user_id
    from public.game_players r2 join public.games g2 on g2.id = r2.game_id where r2.id = p_game_player_id;

    return v_row;
  end if;

  -- No capacity re-check needed: approve_join_request() already reserved
  -- this player's spot the moment it set status = 'payment_pending', and
  -- this is only a status change within that already-reserved seat.
  update public.game_players
    set status = 'joined',
        payment_method = 'cash',
        payment_verified_at = now(),
        contribution_status = 'pending',
        payment_rejected_at = null
    where id = p_game_player_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.choose_play_together_cash_payment(uuid) to authenticated;

-- ── NOTIFICATIONS: one new kind — the host being told a player picked
-- cash instead of online payment. (The player's own confirmation reuses
-- the existing 'game_joined' kind — they're just told to bring cash.) ──
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined','left','spots_needed','hosted','event',
                   'friend_request','friend_accepted',
                   'payment_submitted','payment_approved','payment_rejected',
                   'game_published','game_joined','game_left','game_cancelled',
                   'game_join_requested','game_join_rejected',
                   'game_payment_required','game_payment_reminder',
                   'game_payment_submitted','game_payment_verified',
                   'game_payment_rejected','game_payment_expired',
                   'game_host_payment_submitted','game_host_payment_expired',
                   'game_payment_cash_selected'));

-- ── DONE ─────────────────────────────────────────────────────────
