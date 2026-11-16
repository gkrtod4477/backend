/**
 * DEFERRED: not wired into the app. Multi-player Elo-style rating update. Every pair of
 * players is compared once; expected and actual scores are normalised so one game moves
 * ratings by at most `K * (n - 1)` regardless of how many players took part.
 */
import type { RatingPlacement, RatingProfile, RatingUpdate } from './ranking.types';

export interface EloConfig {
  initialRating: number;
  /** Ratings never fall below this value. */
  ratingFloor: number;
  /** Players with fewer games than this are provisional. */
  provisionalGames: number;
  /** Players with fewer games than this (but not provisional) use the intermediate K. */
  establishedGames: number;
  kProvisional: number;
  kIntermediate: number;
  kEstablished: number;
  /** Logistic scale; 400 means a 400 point gap gives roughly 91% expected win. */
  scale: number;
}

export const DEFAULT_ELO_CONFIG: Readonly<EloConfig> = Object.freeze({
  initialRating: 1000,
  ratingFloor: 100,
  provisionalGames: 10,
  establishedGames: 30,
  kProvisional: 40,
  kIntermediate: 28,
  kEstablished: 20,
  scale: 400,
});

export function createInitialProfile(userId: string, config = DEFAULT_ELO_CONFIG): RatingProfile {
  return { userId, rating: config.initialRating, gamesPlayed: 0 };
}

export function isProvisional(gamesPlayed: number, config = DEFAULT_ELO_CONFIG): boolean {
  return gamesPlayed < config.provisionalGames;
}

export function kFactorFor(gamesPlayed: number, config = DEFAULT_ELO_CONFIG): number {
  if (gamesPlayed < config.provisionalGames) {
    return config.kProvisional;
  }
  return gamesPlayed < config.establishedGames ? config.kIntermediate : config.kEstablished;
}

/** Probability (0..1) that a player rated `rating` beats one rated `opponentRating`. */
export function expectedScore(rating: number, opponentRating: number, scale = 400): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / scale));
}

/** 1 for a better rank, 0.5 for a tie, 0 for a worse rank (rank 1 is best). */
export function actualScore(rank: number, opponentRank: number): number {
  if (rank === opponentRank) {
    return 0.5;
  }
  return rank < opponentRank ? 1 : 0;
}

/**
 * Computes the new ratings for one finished game. Fewer than two players, or duplicate user
 * ids, cannot be rated and yield unchanged profiles / an error respectively.
 */
export function updateRatings(
  placements: RatingPlacement[],
  config: EloConfig = DEFAULT_ELO_CONFIG,
): RatingUpdate[] {
  if (new Set(placements.map((p) => p.userId)).size !== placements.length) {
    throw new Error('Duplicate userId in rating placements');
  }
  const opponentCount = placements.length - 1;
  const pairCount = (placements.length * opponentCount) / 2;

  return placements.map((player) => {
    const k = kFactorFor(player.gamesPlayed, config);
    let delta = 0;
    if (opponentCount > 0) {
      let expected = 0;
      let actual = 0;
      for (const other of placements) {
        if (other.userId === player.userId) {
          continue;
        }
        expected += expectedScore(player.rating, other.rating, config.scale);
        actual += actualScore(player.rank, other.rank);
      }
      delta = (k * opponentCount * (actual - expected)) / pairCount;
    }
    const after = Math.max(config.ratingFloor, Math.round(player.rating + delta));
    const gamesPlayed = player.gamesPlayed + 1;
    return {
      userId: player.userId,
      before: player.rating,
      after,
      delta: after - player.rating,
      kFactor: k,
      gamesPlayed,
      provisional: isProvisional(gamesPlayed, config),
    };
  });
}

/**
 * Ranks participants by score (higher is better). Equal scores share the same rank, so they
 * are rated as a draw against each other.
 */
export function placementsFromScores(
  profiles: RatingProfile[],
  scores: ReadonlyMap<string, number>,
): RatingPlacement[] {
  return profiles.map((profile) => {
    const own = scores.get(profile.userId) ?? 0;
    const better = profiles.filter((o) => (scores.get(o.userId) ?? 0) > own).length;
    return { ...profile, rank: better + 1 };
  });
}

/** Applies updates back onto profiles, returning new objects. */
export function applyRatingUpdates(
  profiles: RatingProfile[],
  updates: RatingUpdate[],
): RatingProfile[] {
  const byUser = new Map(updates.map((u) => [u.userId, u]));
  return profiles.map((p) => {
    const update = byUser.get(p.userId);
    return update ? { ...p, rating: update.after, gamesPlayed: update.gamesPlayed } : p;
  });
}
