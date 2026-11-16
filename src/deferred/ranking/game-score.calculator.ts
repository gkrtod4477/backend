/**
 * DEFERRED: not wired into the app. Computes itemised per-participant and per-room scores
 * for a finished game from its turns, executions and mission results.
 */
import { computeTimeBonus, remainingTimeFraction, resolveScoringPolicy } from './scoring-policy';
import type { ScoringPolicy } from './scoring-policy';
import type {
  GameScoreInput,
  ParticipantScore,
  RoomScore,
  ScoreLine,
  ScoreTurnInput,
} from './ranking.types';

/** Executions that count against the player: the code crashed or ran out of time. */
const PENALISED_EXECUTION_STATUSES = new Set(['FAILED', 'TIMEOUT']);

export function calculateRoomScore(
  input: GameScoreInput,
  policyOverrides: Partial<ScoringPolicy> = {},
): RoomScore {
  const policy = resolveScoringPolicy(policyOverrides);
  const userIds = collectUserIds(input);
  const passedTurnIds = new Set(
    input.missionResults.filter((r) => r.judgeStatus === 'PASSED').map((r) => r.turnId),
  );
  const clearedMissions = new Set(
    input.missionResults.filter((r) => r.judgeStatus === 'PASSED').map((r) => r.missionId),
  );

  const individual = userIds.map((userId) =>
    scoreParticipantTurns(userId, input, passedTurnIds, policy),
  );

  const teamPool = clearedMissions.size * policy.teamPointsPerMission;
  const shares = splitTeamPool(
    teamPool,
    individual.map((p) => p.passedMissions),
    policy.teamContributionWeight,
  );
  const participants = individual.map((p, i) => finalizeParticipant(p, shares[i], policy));

  return {
    gameRoomId: input.gameRoomId,
    missionsTotal: new Set(input.turns.map((t) => t.missionId)).size,
    missionsCleared: clearedMissions.size,
    teamPool,
    participants,
    total: participants.reduce((sum, p) => sum + p.total, 0),
  };
}

/** Joined participants plus anyone who actually played a turn (e.g. left mid-game). */
function collectUserIds(input: GameScoreInput): string[] {
  const ids = new Set<string>();
  for (const p of input.participants) {
    if (p.membershipStatus === 'JOINED') {
      ids.add(p.userId);
    }
  }
  for (const t of input.turns) {
    ids.add(t.playerUserId);
  }
  return [...ids].sort();
}

function scoreParticipantTurns(
  userId: string,
  input: GameScoreInput,
  passedTurnIds: Set<string>,
  policy: ScoringPolicy,
): ParticipantScore {
  const turns = input.turns
    .filter((t) => t.playerUserId === userId)
    .sort((a, b) => a.turnNumber - b.turnNumber);
  const lines: ScoreLine[] = [];
  let passedMissions = 0;
  let timeouts = 0;

  for (const turn of turns) {
    if (passedTurnIds.has(turn.id)) {
      passedMissions += 1;
      lines.push(...passLines(turn, policy));
    }
    if (turn.status === 'TIMEOUT') {
      timeouts += 1;
      lines.push(
        line('TIMEOUT_PENALTY', -policy.timeoutPenalty, `Turn ${turn.turnNumber} timed out`, turn.id),
      );
    }
    const failedLine = failedExecutionLine(turn, input, userId, policy);
    if (failedLine) {
      lines.push(failedLine);
    }
    const hints = input.hintUsages
      .filter((h) => h.userId === userId && h.turnId === turn.id)
      .reduce((sum, h) => sum + Math.max(0, h.count), 0);
    if (hints > 0) {
      lines.push(
        line('HINT_PENALTY', -hints * policy.hintPenalty, `${hints} hint(s) used`, turn.id),
      );
    }
  }

  return {
    userId,
    lines,
    individualTotal: sumPoints(lines),
    teamShare: 0,
    total: 0,
    passedMissions,
    turnsPlayed: turns.length,
    timeouts,
  };
}

function passLines(turn: ScoreTurnInput, policy: ScoringPolicy): ScoreLine[] {
  const lines = [
    line('MISSION_PASS', policy.basePointsPerMission, `Mission passed on turn ${turn.turnNumber}`, turn.id),
  ];
  if (turn.endedAt) {
    const fraction = remainingTimeFraction(turn.startedAt, turn.deadlineAt, turn.endedAt);
    const bonus = computeTimeBonus(fraction, policy);
    if (bonus > 0) {
      const pct = Math.round(fraction * 100);
      lines.push(line('TIME_BONUS', bonus, `${pct}% of turn time remaining`, turn.id));
    }
  }
  return lines;
}

function failedExecutionLine(
  turn: ScoreTurnInput,
  input: GameScoreInput,
  userId: string,
  policy: ScoringPolicy,
): ScoreLine | null {
  const failures = input.executions.filter(
    (e) => e.turnId === turn.id && e.userId === userId && PENALISED_EXECUTION_STATUSES.has(e.status),
  ).length;
  if (failures === 0) {
    return null;
  }
  const penalty = Math.min(
    failures * policy.failedExecutionPenalty,
    policy.maxFailedExecutionPenaltyPerTurn,
  );
  return line('FAILED_EXECUTION_PENALTY', -penalty, `${failures} failed execution(s)`, turn.id);
}

/**
 * Splits the pool: `weight` of it proportionally to contributions, the remainder equally.
 * Integer division leaves at most a few points undistributed, which is acceptable.
 */
export function splitTeamPool(pool: number, contributions: number[], weight: number): number[] {
  const count = contributions.length;
  if (count === 0 || pool <= 0) {
    return contributions.map(() => 0);
  }
  const totalContribution = contributions.reduce((a, b) => a + b, 0);
  // With nobody contributing, the contribution part falls back to an equal split too.
  const effectiveWeight = totalContribution === 0 ? 0 : weight;
  const byContribution = pool * effectiveWeight;
  const equal = pool - byContribution;
  return contributions.map((c) => {
    const proportional = totalContribution === 0 ? 0 : (byContribution * c) / totalContribution;
    return Math.floor(proportional + equal / count);
  });
}

function finalizeParticipant(
  score: ParticipantScore,
  teamShare: number,
  policy: ScoringPolicy,
): ParticipantScore {
  const individualTotal = Math.max(policy.minIndividualTotal, score.individualTotal);
  const lines = [...score.lines];
  if (teamShare > 0) {
    lines.push(line('TEAM_SHARE', teamShare, 'Share of team pool', null));
  }
  return { ...score, lines, individualTotal, teamShare, total: individualTotal + teamShare };
}

function line(kind: ScoreLine['kind'], points: number, description: string, turnId: string | null): ScoreLine {
  return { kind, points, description, turnId };
}

function sumPoints(lines: ScoreLine[]): number {
  return lines.reduce((sum, l) => sum + l.points, 0);
}
