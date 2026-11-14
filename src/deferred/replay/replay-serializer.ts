/**
 * DEFERRED: not wired into the app. Compact, versioned JSON payload for a replay timeline.
 * Events drop fields derivable from their turn (turnNumber, userId, missionId); they are
 * restored from the turn table on read.
 */
import { REPLAY_EVENT_TYPES } from './replay.types';
import type { ReplayEvent, ReplayTimeline } from './replay.types';

export const REPLAY_SCHEMA_VERSION = 1;

type CompactEvent = Omit<ReplayEvent, 'turnNumber' | 'userId' | 'missionId'>;

interface ReplayPayload extends Omit<ReplayTimeline, 'events'> {
  schemaVersion: number;
  events: CompactEvent[];
}

export type ReplayParseResult =
  | { ok: true; timeline: ReplayTimeline }
  | { ok: false; error: string };

export function serializeReplay(timeline: ReplayTimeline): string {
  const events = timeline.events.map((event) => {
    const compact: Partial<ReplayEvent> = { ...event };
    delete compact.turnNumber;
    delete compact.userId;
    delete compact.missionId;
    return compact as CompactEvent;
  });
  const { gameRoomId, startedAt, durationMs, turns, segments } = timeline;
  const payload: ReplayPayload = {
    schemaVersion: REPLAY_SCHEMA_VERSION, gameRoomId, startedAt, durationMs, turns, segments, events,
  };
  return JSON.stringify(payload);
}

export function deserializeReplay(json: string): ReplayParseResult {
  let data: Partial<ReplayPayload>;
  try {
    data = JSON.parse(json) as Partial<ReplayPayload>;
  } catch {
    return { ok: false, error: 'payload is not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || data.schemaVersion !== REPLAY_SCHEMA_VERSION) {
    return { ok: false, error: 'not an object or unsupported schemaVersion' };
  }
  const { gameRoomId, startedAt, durationMs, turns, segments, events } = data;
  if (
    typeof gameRoomId !== 'string' ||
    typeof startedAt !== 'number' ||
    typeof durationMs !== 'number' ||
    !Array.isArray(turns) ||
    !Array.isArray(segments) ||
    !Array.isArray(events)
  ) {
    return { ok: false, error: 'missing or malformed top-level fields' };
  }

  const turnById = new Map(turns.map((t) => [t.turnId, t]));
  const restored: ReplayEvent[] = [];
  let lastOffset = 0;
  for (const [index, event] of events.entries()) {
    const turn = turnById.get(event?.turnId);
    if (!turn) return { ok: false, error: `event ${index} references an unknown turn` };
    if (!(REPLAY_EVENT_TYPES as readonly string[]).includes(event.type)) {
      return { ok: false, error: `event ${index} has unknown type` };
    }
    if (typeof event.offsetMs !== 'number' || event.offsetMs < lastOffset) {
      return { ok: false, error: `event ${index} is out of order` };
    }
    lastOffset = event.offsetMs;
    const { turnNumber, userId, missionId } = turn;
    restored.push({ ...event, turnNumber, userId, missionId } as ReplayEvent);
  }
  return {
    ok: true,
    timeline: { gameRoomId, startedAt, durationMs, turns, segments, events: restored },
  };
}
