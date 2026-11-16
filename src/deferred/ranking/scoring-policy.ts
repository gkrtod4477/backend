/**
 * DEFERRED: not wired into the app. Tunable constants for game scoring. Callers may pass a
 * partial override; `resolveScoringPolicy` fills the rest from `DEFAULT_SCORING_POLICY`.
 */

export interface ScoringPolicy {
  /** Points awarded to the player whose turn produced a PASSED judgement. */
  basePointsPerMission: number;
  /** Maximum bonus for a submission made at the very start of a turn. */
  maxTimeBonus: number;
  /** Exponent applied to the remaining-time fraction; 1 is linear, above 1 decays faster. */
  timeBonusDecayExponent: number;
  /** Penalty (positive number) per turn that ended in TIMEOUT. */
  timeoutPenalty: number;
  /** Penalty per FAILED or TIMEOUT execution. */
  failedExecutionPenalty: number;
  /** Cap on the total failed-execution penalty within one turn. */
  maxFailedExecutionPenaltyPerTurn: number;
  /** Penalty per hint consumed. */
  hintPenalty: number;
  /** Team points added to the pool for every cleared mission. */
  teamPointsPerMission: number;
  /**
   * Share (0..1) of the team pool distributed by contribution (passed missions). The rest is
   * split equally among joined participants.
   */
  teamContributionWeight: number;
  /** Individual totals never drop below this value (0 keeps scores non-negative). */
  minIndividualTotal: number;
}

export const DEFAULT_SCORING_POLICY: Readonly<ScoringPolicy> = Object.freeze({
  basePointsPerMission: 100,
  maxTimeBonus: 50,
  timeBonusDecayExponent: 1.5,
  timeoutPenalty: 30,
  failedExecutionPenalty: 5,
  maxFailedExecutionPenaltyPerTurn: 20,
  hintPenalty: 10,
  teamPointsPerMission: 40,
  teamContributionWeight: 0.6,
  minIndividualTotal: 0,
});

export function resolveScoringPolicy(overrides: Partial<ScoringPolicy> = {}): ScoringPolicy {
  const policy: ScoringPolicy = { ...DEFAULT_SCORING_POLICY, ...overrides };
  if (policy.teamContributionWeight < 0 || policy.teamContributionWeight > 1) {
    throw new RangeError('teamContributionWeight must be within 0..1');
  }
  if (policy.timeBonusDecayExponent <= 0) {
    throw new RangeError('timeBonusDecayExponent must be positive');
  }
  return policy;
}

/** Fraction (0..1) of the turn window still unused when the turn ended. */
export function remainingTimeFraction(startedAt: Date, deadlineAt: Date, endedAt: Date): number {
  const window = deadlineAt.getTime() - startedAt.getTime();
  if (window <= 0) {
    return 0;
  }
  const remaining = deadlineAt.getTime() - endedAt.getTime();
  return Math.min(1, Math.max(0, remaining / window));
}

/** Time bonus decaying from `maxTimeBonus` (instant) to 0 (at the deadline). */
export function computeTimeBonus(fraction: number, policy: ScoringPolicy): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(policy.maxTimeBonus * Math.pow(clamped, policy.timeBonusDecayExponent));
}
