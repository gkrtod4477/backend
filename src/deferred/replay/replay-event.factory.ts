/**
 * DEFERRED: not wired into the app. Pure functions mapping persisted records to replay events.
 * Events leave here with offsetMs = 0; the timeline builder assigns relative offsets.
 */
import type {
  CodeChangeEvent,
  CodeChangeSummary,
  ExecutionEndEvent,
  ExecutionStartEvent,
  MissionResultEvent,
  ReplayEventBase,
  ReplayExecutionRecord,
  ReplayMissionResultRecord,
  ReplayTurnRecord,
  TimeValue,
  TurnEndEvent,
  TurnStartEvent,
} from './replay.types';

export function toEpochMs(value: TimeValue | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function base(id: string, at: number, turn: ReplayTurnRecord, userId = turn.playerUserId): ReplayEventBase {
  return { id, at, offsetMs: 0, turnId: turn.id, turnNumber: turn.turnNumber, userId, missionId: turn.missionId };
}

/** Time at which a turn is considered finished: endedAt, else the deadline. */
export function turnEndMs(turn: ReplayTurnRecord): number {
  return toEpochMs(turn.endedAt) ?? toEpochMs(turn.deadlineAt) ?? 0;
}

export function createTurnStartEvent(turn: ReplayTurnRecord, startMs: number): TurnStartEvent {
  const deadline = toEpochMs(turn.deadlineAt) ?? startMs;
  return {
    ...base(`turn-start:${turn.id}`, startMs, turn),
    type: 'TURN_START',
    budgetMs: Math.max(0, deadline - startMs),
  };
}

export function createTurnEndEvent(turn: ReplayTurnRecord, startMs: number, endMs: number): TurnEndEvent {
  return {
    ...base(`turn-end:${turn.id}`, endMs, turn),
    type: 'TURN_END',
    status: turn.status,
    durationMs: Math.max(0, endMs - startMs),
  };
}

export function createCodeChangeEvent(turn: ReplayTurnRecord, at: number, snapshotId: string, summary: CodeChangeSummary): CodeChangeEvent {
  return {
    ...base(`code-change:${snapshotId}`, at, turn),
    type: 'CODE_CHANGE',
    summary,
  };
}

/** An execution yields a start event when it began and an end event when it finished. */
export function createExecutionEvents(
  turn: ReplayTurnRecord,
  exec: ReplayExecutionRecord,
): Array<ExecutionStartEvent | ExecutionEndEvent> {
  const startedMs = toEpochMs(exec.startedAt);
  const finishedMs = toEpochMs(exec.finishedAt);
  const events: Array<ExecutionStartEvent | ExecutionEndEvent> = [];
  if (startedMs !== null) {
    events.push({
      ...base(`exec-start:${exec.id}`, startedMs, turn, exec.userId),
      type: 'EXECUTION_START',
      executionId: exec.id,
      command: exec.command,
      timeoutMs: exec.timeoutMs,
    });
  }
  if (finishedMs !== null) {
    events.push({
      ...base(`exec-end:${exec.id}`, finishedMs, turn, exec.userId),
      type: 'EXECUTION_END',
      executionId: exec.id,
      status: exec.status,
      exitCode: exec.exitCode,
      durationMs: startedMs === null ? null : Math.max(0, finishedMs - startedMs),
      failureCode: exec.runtimeFailureCode,
    });
  }
  return events;
}

export function createMissionResultEvent(turn: ReplayTurnRecord, result: ReplayMissionResultRecord, at: number): MissionResultEvent {
  return {
    ...base(`mission-result:${result.id}`, at, turn),
    type: 'MISSION_RESULT',
    judgeStatus: result.judgeStatus,
    payload: result.resultPayloadJson,
  };
}
