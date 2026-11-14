/**
 * DEFERRED: not wired into the app. Collects persisted records, merges them into one ordered
 * timeline with relative timestamps, and reports inconsistencies as data (never throws).
 */
import { summarizeCodeChange } from './code-diff';
import {
  createCodeChangeEvent,
  createExecutionEvents,
  createMissionResultEvent,
  createTurnEndEvent,
  createTurnStartEvent,
  toEpochMs,
  turnEndMs,
} from './replay-event.factory';
import type {
  ParticipantSegment,
  ReplayBuildResult,
  ReplayEvent,
  ReplayEventType,
  ReplayExecutionRecord,
  ReplayIssue,
  ReplayMissionResultRecord,
  ReplaySnapshotFile,
  ReplaySnapshotRecord,
  ReplayTurnRecord,
  TurnBoundary,
} from './replay.types';

/** Tie-break for events with the same timestamp. */
const TYPE_ORDER: Record<ReplayEventType, number> = {
  TURN_START: 0, EXECUTION_START: 1, EXECUTION_END: 2, CODE_CHANGE: 3, MISSION_RESULT: 4, TURN_END: 5,
};

export class ReplayTimelineBuilder {
  private readonly turns: ReplayTurnRecord[] = [];
  private readonly snapshots: ReplaySnapshotRecord[] = [];
  private readonly executions: ReplayExecutionRecord[] = [];
  private readonly results: ReplayMissionResultRecord[] = [];
  private issues: ReplayIssue[] = [];

  constructor(private readonly gameRoomId: string) {}

  addTurn(turn: ReplayTurnRecord): this {
    this.turns.push(turn);
    return this;
  }

  addSnapshot(snapshot: ReplaySnapshotRecord): this {
    this.snapshots.push(snapshot);
    return this;
  }

  addExecution(execution: ReplayExecutionRecord): this {
    this.executions.push(execution);
    return this;
  }

  addMissionResult(result: ReplayMissionResultRecord): this {
    this.results.push(result);
    return this;
  }

  private issue(severity: ReplayIssue['severity'], code: string, message: string, refId?: string): void {
    this.issues.push({ severity, code, message, refId });
  }

  build(): ReplayBuildResult {
    this.issues = [];
    const issues = this.issues;
    const turns = this.turns
      .filter((t) => {
        const same = t.gameRoomId === this.gameRoomId;
        if (!same) this.issue('error', 'ROOM_MISMATCH', 'turn is from another room', t.id);
        return same;
      })
      .sort((a, b) => a.turnNumber - b.turnNumber);
    if (turns.length === 0) {
      this.issue('error', 'EMPTY_INPUT', 'no turns to build a replay from');
      return { ok: false, timeline: null, issues };
    }

    const windows = new Map<string, [number, number]>();
    const events: ReplayEvent[] = [];
    let previousEnd = Number.NEGATIVE_INFINITY;
    turns.forEach((turn, index) => {
      const start = toEpochMs(turn.startedAt);
      if (start === null) {
        return this.issue('error', 'INVALID_TIME', 'startedAt is invalid', turn.id);
      }
      if (index > 0 && turn.turnNumber === turns[index - 1].turnNumber) {
        this.issue('error', 'DUPLICATE_TURN_NUMBER', `turn ${turn.turnNumber} repeats`, turn.id);
      }
      if (turn.status !== 'IN_PROGRESS' && turn.endedAt === null) {
        this.issue('warning', 'MISSING_ENDED_AT', 'deadline used as end time', turn.id);
      }
      if (turnEndMs(turn) < start) {
        this.issue('error', 'END_BEFORE_START', 'turn ends before it starts', turn.id);
      }
      if (start < previousEnd) {
        this.issue('error', 'TURN_OVERLAP', 'starts before the previous turn ended', turn.id);
      }
      const end = Math.max(start, turnEndMs(turn));
      previousEnd = end;
      windows.set(turn.id, [start, end]);
      events.push(createTurnStartEvent(turn, start), createTurnEndEvent(turn, start, end));
    });

    const turnById = new Map(turns.map((t) => [t.id, t]));
    this.collectSnapshots(turns, windows, events);
    this.collectExecutions(turnById, windows, events);
    this.collectResults(turns, turnById, events);

    events.sort(
      (a, b) =>
        a.at - b.at || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.id.localeCompare(b.id),
    );
    const origin = events[0].at;
    for (const event of events) event.offsetMs = event.at - origin;

    const boundaries: TurnBoundary[] = [];
    for (const turn of turns) {
      const w = windows.get(turn.id);
      if (!w) continue;
      boundaries.push({
        turnId: turn.id, turnNumber: turn.turnNumber, userId: turn.playerUserId, missionId: turn.missionId,
        status: turn.status, startOffsetMs: w[0] - origin, endOffsetMs: w[1] - origin,
      });
    }
    const durationMs = Math.max(...boundaries.map((b) => b.endOffsetMs), 0);
    const segments = this.buildSegments(boundaries);
    return {
      ok: !issues.some((i) => i.severity === 'error'),
      issues,
      timeline: { gameRoomId: this.gameRoomId, startedAt: origin, durationMs, turns: boundaries, segments, events },
    };
  }

  /** Each turn-end snapshot is diffed against the previous turn's snapshot (empty for the first). */
  private collectSnapshots(turns: ReplayTurnRecord[], windows: Map<string, [number, number]>, events: ReplayEvent[]): void {
    const byTurn = new Map<string, ReplaySnapshotRecord>();
    for (const snap of this.snapshots) {
      if (!windows.has(snap.turnId)) {
        this.issue('warning', 'ORPHAN_SNAPSHOT', 'unknown turn', snap.id);
      } else if (byTurn.has(snap.turnId)) {
        this.issue('warning', 'DUPLICATE_SNAPSHOT', 'duplicate snapshot', snap.id);
      } else {
        byTurn.set(snap.turnId, snap);
      }
    }
    let previous: ReplaySnapshotFile[] = [];
    for (const turn of turns) {
      const snap = byTurn.get(turn.id);
      const window = windows.get(turn.id);
      if (!snap || !window) continue;
      const files = snap.codeSnapshotJson.files;
      const summary = summarizeCodeChange(previous, files);
      events.push(createCodeChangeEvent(turn, window[1], snap.id, summary));
      previous = files;
    }
  }

  private collectExecutions(turnById: Map<string, ReplayTurnRecord>, windows: Map<string, [number, number]>, events: ReplayEvent[]): void {
    for (const exec of this.executions) {
      const turn = turnById.get(exec.turnId);
      const window = windows.get(exec.turnId);
      if (!turn || !window) {
        this.issue('warning', 'ORPHAN_EXECUTION', 'unknown turn', exec.id);
        continue;
      }
      const created = createExecutionEvents(turn, exec);
      if (created.some((e) => e.at < window[0] || e.at > window[1])) {
        this.issue('warning', 'EVENT_OUT_OF_TURN', 'execution lies outside its turn', exec.id);
      }
      events.push(...created);
    }
  }

  private collectResults(turns: ReplayTurnRecord[], turnById: Map<string, ReplayTurnRecord>, events: ReplayEvent[]): void {
    const judged = new Set<string>();
    for (const result of this.results) {
      const turn = turnById.get(result.turnId);
      const at = toEpochMs(result.occurredAt);
      if (!turn || at === null) {
        this.issue('warning', 'BAD_MISSION_RESULT', 'unknown turn or invalid time', result.id);
        continue;
      }
      judged.add(turn.id);
      events.push(createMissionResultEvent(turn, result, at));
    }
    for (const turn of turns) {
      if (turn.status === 'SUBMITTED' && !judged.has(turn.id)) {
        this.issue('warning', 'MISSING_MISSION_RESULT', 'submitted turn has no result', turn.id);
      }
    }
  }

  private buildSegments(boundaries: TurnBoundary[]): ParticipantSegment[] {
    const segments = new Map<string, ParticipantSegment>();
    for (const b of boundaries) {
      const seg = segments.get(b.userId) ?? { userId: b.userId, turnIds: [], totalMs: 0 };
      seg.turnIds.push(b.turnId);
      seg.totalMs += b.endOffsetMs - b.startOffsetMs;
      segments.set(b.userId, seg);
    }
    return [...segments.values()];
  }
}
