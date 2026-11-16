/**
 * DEFERRED: not wired into the app. Input, score, rating and leaderboard shapes for the
 * ranking feature. Inputs mirror the fields of the persisted entities without importing them.
 */

/** Mirrors `TurnStatus`. */
export type TurnStatusValue = 'IN_PROGRESS' | 'SUBMITTED' | 'TIMEOUT';
/** Mirrors `ExecutionStatus`. */
export type ExecutionStatusValue = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';
/** Mirrors `MissionResultJudgeStatus`. */
export type JudgeStatusValue = 'PASSED' | 'FAILED' | 'ERROR';
/** Mirrors `GameRoomParticipantMembershipStatus`. */
export type MembershipStatusValue = 'INVITED' | 'JOINED' | 'LEFT' | 'DENIED';

/** Subset of `TurnEntity`. */
export interface ScoreTurnInput {
  id: string;
  missionId: string;
  playerUserId: string;
  turnNumber: number;
  status: TurnStatusValue;
  startedAt: Date;
  deadlineAt: Date;
  endedAt: Date | null;
}

/** Subset of `ExecutionEntity`. */
export interface ScoreExecutionInput {
  turnId: string;
  userId: string;
  status: ExecutionStatusValue;
}

/** Subset of `MissionResultEntity`. */
export interface ScoreMissionResultInput {
  turnId: string;
  missionId: string;
  judgeStatus: JudgeStatusValue;
}

/** Subset of `GameRoomParticipantEntity`. */
export interface ScoreParticipantInput {
  userId: string;
  membershipStatus: MembershipStatusValue;
}

/** Number of hints a participant consumed in one turn (assumed to come from AI chat logs). */
export interface HintUsageInput {
  userId: string;
  turnId: string;
  count: number;
}

/** Everything needed to score one finished game room. */
export interface GameScoreInput {
  gameRoomId: string;
  participants: ScoreParticipantInput[];
  turns: ScoreTurnInput[];
  executions: ScoreExecutionInput[];
  missionResults: ScoreMissionResultInput[];
  hintUsages: HintUsageInput[];
}

export type ScoreLineKind =
  | 'MISSION_PASS'
  | 'TIME_BONUS'
  | 'TIMEOUT_PENALTY'
  | 'FAILED_EXECUTION_PENALTY'
  | 'HINT_PENALTY'
  | 'TEAM_SHARE';

/** One itemised line of a score breakdown; penalties carry negative points. */
export interface ScoreLine {
  kind: ScoreLineKind;
  points: number;
  description: string;
  turnId: string | null;
}

export interface ParticipantScore {
  userId: string;
  lines: ScoreLine[];
  /** Sum of the individual lines (everything except TEAM_SHARE). */
  individualTotal: number;
  teamShare: number;
  total: number;
  passedMissions: number;
  turnsPlayed: number;
  timeouts: number;
}

export interface RoomScore {
  gameRoomId: string;
  missionsTotal: number;
  missionsCleared: number;
  teamPool: number;
  participants: ParticipantScore[];
  total: number;
}

/** A player's persistent rating state. */
export interface RatingProfile {
  userId: string;
  rating: number;
  gamesPlayed: number;
}

/** One participant's result in a single game; rank 1 is best and equal ranks are a tie. */
export interface RatingPlacement extends RatingProfile {
  rank: number;
}

export interface RatingUpdate {
  userId: string;
  before: number;
  after: number;
  delta: number;
  kFactor: number;
  gamesPlayed: number;
  provisional: boolean;
}

export interface LeaderboardCandidate {
  userId: string;
  rating: number;
  totalScore: number;
  wins: number;
  gamesPlayed: number;
  /** When the player reached the current rating; earlier wins the final tie-break. */
  reachedAt: Date;
}

export type RankingMode = 'standard' | 'dense';

export interface LeaderboardEntry extends LeaderboardCandidate {
  rank: number;
  /** Positive = climbed, negative = dropped, null = absent from the previous snapshot. */
  rankChange: number | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SeasonWindow {
  index: number;
  startsAt: Date;
  endsAt: Date;
}
