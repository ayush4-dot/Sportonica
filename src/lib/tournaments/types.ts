// Mirrors supabase/tournaments.sql exactly — see that file for the
// authoritative schema/constraints and the state-machine RPCs.

export const TOURNAMENT_FORMATS = ["knockout", "league", "group_knockout"] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  knockout: "Knockout",
  league: "League (round robin)",
  group_knockout: "Groups + Knockout",
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
  venue_id: string;
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
  status: TournamentStatus;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentTeam {
  id: string;
  tournament_id: string;
  name: string;
  captain_id: string;
  ack_terms: boolean;
  status: TeamStatus;
  created_at: string;
}

export interface TournamentTeamPlayer {
  id: string;
  team_id: string;
  user_id: string;
  role: "captain" | "player" | "substitute";
  joined_at: string;
}

// Everything create_tournament()/update_tournament_draft() accept — sent
// as a single jsonb blob, matching the RPC signatures in tournaments.sql.
export type TournamentDraftInput = Partial<{
  venue_id: string;
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
}>;

export const TOURNAMENT_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "Tournament not found.",
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
};

export function friendlyTournamentError(message: string): string {
  for (const code in TOURNAMENT_ERROR_MESSAGES) {
    if (message.includes(code)) return TOURNAMENT_ERROR_MESSAGES[code];
  }
  return message;
}
