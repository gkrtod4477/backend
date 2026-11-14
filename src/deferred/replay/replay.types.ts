/**
 * DEFERRED: not wired into the app. Replay is out of MVP scope (docs/specs/00-overview.md).
 * Input records mirror the persisted entity fields; replay events and timeline are the output.
 */
import type { ExecutionStatus, MissionResultJudgeStatus, TurnStatus } from '@shared/enums';

export type TurnStatusName = `${TurnStatus}`;
export type ExecutionStatusName = `${ExecutionStatus}`;
export type JudgeStatusName = `${MissionResultJudgeStatus}`;
export type TimeValue = Date | string;

// ---- Input records (subset of entity columns) ----

export interface ReplayTurnRecord {
  id: string;
  gameRoomId: string;
  missionId: string;
  playerUserId: string;
  turnNumber: number;
  status: TurnStatusName;
  startedAt: TimeValue;
  deadlineAt: TimeValue;
  endedAt: TimeValue | null;
}

export interface ReplaySnapshotFile { filePath: string; content: string; occurredAt?: string }

export interface ReplaySnapshotRecord {
  id: string;
  gameRoomId: string;
  turnId: string;
  userId: string;
  codeSnapshotJson: { files: ReplaySnapshotFile[] };
}

export interface ReplayExecutionRecord {
  id: string;
  gameRoomId: string;
  turnId: string;
  userId: string;
  status: ExecutionStatusName;
  command: string;
  timeoutMs: number | null;
  exitCode: number | null;
  runtimeFailureCode: string | null;
  startedAt: TimeValue | null;
  finishedAt: TimeValue | null;
}

export interface ReplayMissionResultRecord {
  id: string;
  gameRoomId: string;
  missionId: string;
  turnId: string;
  judgeStatus: JudgeStatusName;
  resultPayloadJson: Record<string, unknown>;
  occurredAt: TimeValue;
}

// ---- Code diff ----

export interface DiffHunk {
  filePath: string; oldStart: number; newStart: number; removed: string[]; added: string[];
}

export interface CodeChangeSummary {
  filesChanged: string[]; addedLines: number; removedLines: number; hunks: DiffHunk[];
}

// ---- Replay events ----

export const REPLAY_EVENT_TYPES = [
  'TURN_START', 'CODE_CHANGE', 'EXECUTION_START', 'EXECUTION_END', 'MISSION_RESULT', 'TURN_END',
] as const;
export type ReplayEventType = (typeof REPLAY_EVENT_TYPES)[number];

/** `at` is absolute epoch ms; `offsetMs` is relative to the replay start and is set by the builder. */
export interface ReplayEventBase {
  id: string;
  at: number;
  offsetMs: number;
  turnId: string;
  turnNumber: number;
  userId: string;
  missionId: string;
}

export interface TurnStartEvent extends ReplayEventBase { type: 'TURN_START'; budgetMs: number }

export interface CodeChangeEvent extends ReplayEventBase { type: 'CODE_CHANGE'; summary: CodeChangeSummary }

export interface ExecutionStartEvent extends ReplayEventBase {
  type: 'EXECUTION_START';
  executionId: string;
  command: string;
  timeoutMs: number | null;
}

export interface ExecutionEndEvent extends ReplayEventBase {
  type: 'EXECUTION_END';
  executionId: string;
  status: ExecutionStatusName;
  exitCode: number | null;
  durationMs: number | null;
  failureCode: string | null;
}

export interface MissionResultEvent extends ReplayEventBase {
  type: 'MISSION_RESULT';
  judgeStatus: JudgeStatusName;
  payload: Record<string, unknown>;
}

export interface TurnEndEvent extends ReplayEventBase {
  type: 'TURN_END'; status: TurnStatusName; durationMs: number;
}

export type ReplayEvent =
  | TurnStartEvent
  | CodeChangeEvent
  | ExecutionStartEvent
  | ExecutionEndEvent
  | MissionResultEvent
  | TurnEndEvent;

// ---- Timeline ----

export interface TurnBoundary {
  turnId: string;
  turnNumber: number;
  userId: string;
  missionId: string;
  status: TurnStatusName;
  startOffsetMs: number;
  endOffsetMs: number;
}

export interface ParticipantSegment { userId: string; turnIds: string[]; totalMs: number }

export interface ReplayTimeline {
  gameRoomId: string;
  startedAt: number;
  durationMs: number;
  turns: TurnBoundary[];
  segments: ParticipantSegment[];
  events: ReplayEvent[];
}

export interface ReplayIssue {
  severity: 'error' | 'warning'; code: string; message: string; refId?: string;
}

/** Normal invalid input is reported through `issues`; `timeline` is null only when nothing can be built. */
export interface ReplayBuildResult {
  ok: boolean;
  timeline: ReplayTimeline | null;
  issues: ReplayIssue[];
}
