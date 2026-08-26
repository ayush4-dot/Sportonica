// Mirrors supabase/tournaments.sql exactly — see that file for the
// authoritative schema/constraints and the state-machine RPCs.

export const TOURNAMENT_FORMATS = ["knockout", "league", "group_knockout", "single_event"] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  knockout: "Knockout",
  league: "League (round robin)",
  group_knockout: "Groups + Knockout",
  single_event: "Single event (no bracket)",
};

export const TOURNAMENT_STATUS = [
  "draft", "pending_approval", "published", "registration_open",
  "registration_closed", "live", "completed", "cancelled",
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUS)[number];

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  published: "Published",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  live: "Live",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TEAM_STATUS = [
  "pending", "payment_pending", "verification_pending", "confirmed", "rejected", "withdrawn",
] as const;
export type TeamStatus = (typeof TEAM_STATUS)[number];

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  pending: "Pending",
  payment_pending: "Payment required",
  verification_pending: "Awaiting verification",
  confirmed: "Confirmed",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export interface Tournament {
  id: string;
  // Exactly one of venue_id or own_venue_name is set — a real, listed
  // Sportonica venue (reached via an Organizer/Vendor partnership) or an
  // Organizer's own venue (name + location pin only, no courts, no
  // court-conflict-checked scheduling).
  venue_id: string | null;
  own_venue_name: string | null;
  own_venue_address: string | null;
  own_venue_map_url: string | null;
  own_venue_lat: number | null;
  own_venue_lng: number | null;
  owner_id: string | null;
  organizer_type: "venue" | "platform";
  organizer_name: string | null;
  name: string;
  sport: string;
  banner_url: string | null;
  description: string | null;
  contact_phone: string | null;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  match_duration_mins: number | null;
  format: TournamentFormat;
  max_teams: number;
  min_players_per_team: number;
  max_players_per_team: number;
  substitute_limit: number;
  registration_mode: "team" | "individual";
  gender_rule: string | null;
  skill_category: string | null;
  fee: number;
  payment_instructions: string | null;
  refund_policy: string | null;
  prize_winner: string | null;
  prize_runner_up: string | null;
  prize_mvp: string | null;
  prize_other: string | null;
  rules_text: string | null;
  equipment_notes: string | null;
  venue_rules: string | null;
  yellow_card_fine: number;
  red_card_fine: number;
  status: TournamentStatus;
  cancel_reason: string | null;
  venue_booking_status: "pending" | "confirmed" | "declined";
  created_at: string;
  updated_at: string;
}

export interface TournamentTeam {
  id: string;
  tournament_id: string;
  name: string;
  captain_id: string | null;
  ack_terms: boolean;
  status: TeamStatus;
  seed: number | null;
  group_name: string | null;
  is_walkin: boolean;
  created_at: string;
}

export const MATCH_STAGES = ["group", "league", "knockout"] as const;
export type MatchStage = (typeof MATCH_STAGES)[number];

export const MATCH_STATUS = ["unscheduled", "scheduled", "completed", "walkover", "cancelled"] as const;
export type MatchStatus = (typeof MATCH_STATUS)[number];

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  completed: "Completed",
  walkover: "Walkover",
  cancelled: "Cancelled",
};

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  stage: MatchStage;
  group_name: string | null;
  round: number;
  round_label: string;
  team_a_id: string | null;
  team_b_id: string | null;
  next_match_id: string | null;
  next_match_slot: "a" | "b" | null;
  court_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: MatchStatus;
  score_a: number | null;
  score_b: number | null;
  score_a_et: number | null;
  score_b_et: number | null;
  score_a_pens: number | null;
  score_b_pens: number | null;
  winner_team_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentAnnouncement {
  id: string;
  tournament_id: string;
  title: string;
  body: string | null;
  posted_by: string;
  created_at: string;
}

export interface TournamentStanding {
  team_id: string;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
}

export interface TournamentPlayerStatRow {
  team_player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  mom_count: number;
}

export interface TournamentAwards {
  winner: string | null;
  runnerUp: string | null;
  semifinalists: string[];
}

export interface TournamentTeamPlayer {
  id: string;
  team_id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  role: "captain" | "player" | "substitute";
  joined_at: string;
}

export type WalkinMember = { name: string; phone: string; email?: string };

export interface TournamentMatchPlayerStat {
  id: string;
  match_id: string;
  team_player_id: string;
  goals: number;
  assists: number;
  is_mom: boolean;
  yellow_cards: number;
  red_card: boolean;
}

export interface PlayerScorecard {
  goals: number;
  matches_played: number;
  tournaments_played: number;
  mom_count: number;
}

// Everything create_tournament()/update_tournament_draft() accept — sent
// as a single jsonb blob, matching the RPC signatures in tournaments.sql.
export type TournamentDraftInput = Partial<{
  venue_id: string;
  own_venue_name: string;
  own_venue_address: string;
  own_venue_map_url: string;
  own_venue_lat: number;
  own_venue_lng: number;
  organizer_type: "venue" | "platform";
  organizer_name: string;
  name: string;
  sport: string;
  banner_url: string;
  description: string;
  contact_phone: string;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  match_duration_mins: number;
  format: TournamentFormat;
  max_teams: number;
  min_players_per_team: number;
  max_players_per_team: number;
  substitute_limit: number;
  registration_mode: "team" | "individual";
  gender_rule: string;
  skill_category: string;
  fee: number;
  payment_instructions: string;
  refund_policy: string;
  prize_winner: string;
  prize_runner_up: string;
  prize_mvp: string;
  prize_other: string;
  rules_text: string;
  equipment_notes: string;
  venue_rules: string;
  yellow_card_fine: number;
  red_card_fine: number;
}>;

export const TOURNAMENT_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "Tournament not found.",
  VENUE_NOT_FOUND: "That venue couldn't be found.",
  VENUE_NOT_CONFIRMED: "The venue hasn't confirmed hosting this tournament yet — check back once they respond, or pick another venue.",
  INVALID_STATUS: "That's not a valid status.",
  ROLE_CHANGE_NOT_ALLOWED: "That account change isn't allowed.",
  NOT_A_DRAFT: "This tournament has already been submitted and can no longer be edited — cancel it to start over.",
  INVALID_TRANSITION: "That action isn't available for this tournament right now.",
  INCOMPLETE_TOURNAMENT: "Fill in the required fields before publishing.",
  TOURNAMENT_NOT_FOUND: "Tournament not found.",
  REGISTRATION_CLOSED: "Registration for this tournament is closed.",
  TOURNAMENT_FULL: "This tournament has reached its team limit.",
  ALREADY_REGISTERED: "You've already registered a team for this tournament.",
  TERMS_NOT_ACKNOWLEDGED: "You need to agree to the terms to register.",
  TEAM_NAME_REQUIRED: "Enter a team name.",
  TEAM_NOT_FOUND: "Team not found.",
  ROSTER_LOCKED: "This team's roster is locked — payment is already underway or verified.",
  ROSTER_FULL: "This team's roster is already full.",
  SUBSTITUTE_LIMIT_REACHED: "This team's substitute slots are full.",
  CANNOT_REMOVE_CAPTAIN: "The captain can't be removed from the roster.",
  TEAM_NOT_CONFIRMED: "Only confirmed teams can be seeded.",
  WRONG_FORMAT: "That action doesn't apply to this tournament's format.",
  ALREADY_GENERATED: "Fixtures have already been generated for this tournament.",
  TEAMS_NOT_GROUPED: "Assign every confirmed team to a group before generating fixtures.",
  NOT_ENOUGH_TEAMS: "Not enough confirmed teams to generate fixtures.",
  GROUP_STAGE_INCOMPLETE: "Every group match needs a result before the knockout stage can be generated.",
  INVALID_ADVANCE_COUNT: "Enter how many teams advance from each group.",
  MATCH_NOT_FOUND: "Match not found.",
  TEAMS_NOT_SET: "Both teams for this match aren't set yet.",
  MATCH_ALREADY_DONE: "This match is already finished.",
  COURT_NOT_FOUND: "Court not found.",
  COURT_NOT_IN_VENUE: "That court doesn't belong to this tournament's venue.",
  INVALID_TIME_RANGE: "End time must be after start time.",
  SLOT_TAKEN: "That court is already booked for that time.",
  SLOT_BLOCKED: "That court is blocked for that time.",
  SCORES_REQUIRED: "Enter a score for both teams.",
  INVALID_WINNER: "Pick one of the two teams as the winner.",
  KNOCKOUT_CANNOT_DRAW: "Knockout matches can't end in a draw — enter a winner instead.",
  INCOMPLETE_MATCHES: "Every match needs a result before the tournament can be completed.",
  TITLE_REQUIRED: "Enter a title for the announcement.",
  AT_LEAST_ONE_MEMBER_REQUIRED: "Add at least one team member.",
  MEMBER_NAME_REQUIRED: "Enter a name for every team member.",
  MEMBER_PHONE_REQUIRED: "Enter a phone number for every team member.",
  TOO_MANY_PLAYERS: "That's more members than this tournament allows per team.",
  NOT_A_WALKIN_TEAM: "That's not a walk-in team.",
  NOT_PENDING_PAYMENT: "This team isn't waiting on a payment.",
  MATCH_NOT_COMPLETED: "Enter the match score before recording player stats.",
  PLAYER_NOT_IN_MATCH: "That player isn't on either team in this match.",
  TEAM_NAME_TAKEN: "A team with that name is already registered for this tournament.",
};

export function friendlyTournamentError(message: string): string {
  for (const code in TOURNAMENT_ERROR_MESSAGES) {
    if (message.includes(code)) return TOURNAMENT_ERROR_MESSAGES[code];
  }
  return message;
}
