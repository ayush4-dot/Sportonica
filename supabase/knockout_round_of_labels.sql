-- Knockout round labels: use "Round of 32" / "Round of 16" instead of
-- "Round 1" / "Round 2" for the rounds before the Quarterfinal.
--
-- Round r has 2^(p_rounds - r + 1) teams, so that's the "of N".
-- Existing matches keep whatever label they were created with; re-run
-- bracket generation (or rename by hand) to pick up the new labels.

create or replace function public.tournament_round_label(p_round int, p_rounds int)
returns text language sql immutable as $$
  select case
    when p_round = p_rounds then 'Final'
    when p_round = p_rounds - 1 then 'Semifinal'
    when p_round = p_rounds - 2 then 'Quarterfinal'
    else 'Round of ' || (2 ^ (p_rounds - p_round + 1))::int
  end;
$$;

-- Backfill existing knockout matches that still carry the old "Round N"
-- labels. p_rounds isn't stored per match, but the highest round number
-- in a tournament's knockout stage is its Final, so p_rounds = max(round).
update public.tournament_matches m
set round_label = public.tournament_round_label(
      m.round,
      (select max(m2.round) from public.tournament_matches m2
       where m2.tournament_id = m.tournament_id and m2.stage = 'knockout')
    )
where m.stage = 'knockout'
  and m.round_label ~ '^Round [0-9]+$';
