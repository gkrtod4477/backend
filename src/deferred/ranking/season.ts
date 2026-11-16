/**
 * DEFERRED: not wired into the app. Fixed-length season windows (UTC) and the soft reset that
 * pulls ratings toward a mean when a new season begins.
 */
import { DEFAULT_ELO_CONFIG } from './elo-rating';
import type { EloConfig } from './elo-rating';
import type { RatingProfile, SeasonWindow } from './ranking.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SeasonConfig {
  /** Start of season 1 (UTC). */
  anchor: Date;
  lengthDays: number;
}

export interface SoftResetConfig {
  /** Rating everyone is pulled toward. */
  mean: number;
  /** Fraction (0..1) of the distance from the mean that is kept. */
  retention: number;
  /** Games counted after reset, so veterans are briefly volatile again but not provisional. */
  carriedGames: number;
}

export const DEFAULT_SOFT_RESET: Readonly<SoftResetConfig> = Object.freeze({
  mean: DEFAULT_ELO_CONFIG.initialRating,
  retention: 0.5,
  carriedGames: 10,
});

/** Season containing `date`; null when the date precedes the first season. */
export function getSeasonForDate(date: Date, config: SeasonConfig): SeasonWindow | null {
  const lengthMs = config.lengthDays * MS_PER_DAY;
  const offset = date.getTime() - config.anchor.getTime();
  if (lengthMs <= 0 || offset < 0) {
    return null;
  }
  return getSeasonByIndex(Math.floor(offset / lengthMs) + 1, config);
}

/** Window of the 1-based season `index`. */
export function getSeasonByIndex(index: number, config: SeasonConfig): SeasonWindow {
  const lengthMs = config.lengthDays * MS_PER_DAY;
  const startsAt = new Date(config.anchor.getTime() + (index - 1) * lengthMs);
  return { index, startsAt, endsAt: new Date(startsAt.getTime() + lengthMs) };
}

/** True when `date` falls in the half-open interval [startsAt, endsAt). */
export function isWithinSeason(date: Date, season: SeasonWindow): boolean {
  return date >= season.startsAt && date < season.endsAt;
}

/** Whole days left in the season, never negative. */
export function daysRemaining(now: Date, season: SeasonWindow): number {
  return Math.max(0, Math.ceil((season.endsAt.getTime() - now.getTime()) / MS_PER_DAY));
}

export function softResetRating(
  rating: number,
  reset: SoftResetConfig = DEFAULT_SOFT_RESET,
  floor: number = DEFAULT_ELO_CONFIG.ratingFloor,
): number {
  return Math.max(floor, Math.round(reset.mean + (rating - reset.mean) * reset.retention));
}

/** Soft reset for every profile at the start of a season; never raises games played. */
export function softResetProfiles(
  profiles: RatingProfile[],
  reset: SoftResetConfig = DEFAULT_SOFT_RESET,
  elo: Pick<EloConfig, 'ratingFloor'> = DEFAULT_ELO_CONFIG,
): RatingProfile[] {
  return profiles.map((p) => ({
    ...p,
    rating: softResetRating(p.rating, reset, elo.ratingFloor),
    gamesPlayed: Math.min(p.gamesPlayed, reset.carriedGames),
  }));
}
