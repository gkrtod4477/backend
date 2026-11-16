/**
 * DEFERRED: not wired into the app. Leaderboard ordering, ranking with ties, pagination and
 * rank-change deltas against a previous snapshot.
 *
 * Ordering: rating, total score, wins (all descending). Players equal on all three share a
 * rank. Display order among them is decided by who reached the rating first, then userId.
 */
import type {
  LeaderboardCandidate,
  LeaderboardEntry,
  Page,
  RankingMode,
} from './ranking.types';

/** Previous snapshot: userId -> rank at that time. */
export type RankSnapshot = ReadonlyMap<string, number>;

/** Comparator for rank equality; 0 means the two players are tied. */
export function compareRankKeys(a: LeaderboardCandidate, b: LeaderboardCandidate): number {
  return b.rating - a.rating || b.totalScore - a.totalScore || b.wins - a.wins;
}

/** Full ordering: rank keys, then earliest `reachedAt`, then userId for determinism. */
export function compareDisplayOrder(a: LeaderboardCandidate, b: LeaderboardCandidate): number {
  return (
    compareRankKeys(a, b) ||
    a.reachedAt.getTime() - b.reachedAt.getTime() ||
    a.userId.localeCompare(b.userId)
  );
}

/**
 * Builds the ranked list. `standard` ranking skips numbers after a tie (1, 1, 3) while
 * `dense` does not (1, 1, 2). Players with no games are excluded.
 */
export function buildLeaderboard(
  candidates: LeaderboardCandidate[],
  options: { mode?: RankingMode; previous?: RankSnapshot } = {},
): LeaderboardEntry[] {
  const mode = options.mode ?? 'standard';
  const sorted = candidates.filter((c) => c.gamesPlayed > 0).sort(compareDisplayOrder);

  let rank = 0;
  return sorted.map((candidate, index) => {
    const tiedWithPrevious = index > 0 && compareRankKeys(sorted[index - 1], candidate) === 0;
    if (!tiedWithPrevious) {
      rank = mode === 'dense' ? rank + 1 : index + 1;
    }
    return { ...candidate, rank, rankChange: rankChange(options.previous, candidate.userId, rank) };
  });
}

function rankChange(previous: RankSnapshot | undefined, userId: string, rank: number): number | null {
  const before = previous?.get(userId);
  return before === undefined ? null : before - rank;
}

/** Captures the current ranks so the next build can report movement. */
export function toRankSnapshot(entries: LeaderboardEntry[]): Map<string, number> {
  return new Map(entries.map((e) => [e.userId, e.rank]));
}

/** 1-based page slice; page and size are clamped to sane values. */
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(totalPages, Math.max(1, Math.floor(page)));
  const start = (current - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: current,
    pageSize: size,
    totalItems: items.length,
    totalPages,
  };
}

/** Entries within `radius` positions of a player, for a "your neighbourhood" view. */
export function entriesAround(
  entries: LeaderboardEntry[],
  userId: string,
  radius: number,
): LeaderboardEntry[] {
  const index = entries.findIndex((e) => e.userId === userId);
  if (index === -1) {
    return [];
  }
  const span = Math.max(0, Math.floor(radius));
  return entries.slice(Math.max(0, index - span), index + span + 1);
}

/** Percentile (0..100, higher is better) of a player; null when not on the board. */
export function percentileOf(entries: LeaderboardEntry[], userId: string): number | null {
  const entry = entries.find((e) => e.userId === userId);
  if (!entry || entries.length === 0) {
    return null;
  }
  const beaten = entries.filter((e) => e.rank > entry.rank).length;
  return Math.round((beaten / entries.length) * 100);
}
