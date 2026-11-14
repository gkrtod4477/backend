/**
 * DEFERRED: not wired into the app. Aggregate statistics over a built replay timeline.
 */
import type { ReplayTimeline } from './replay.types';

export interface MissionOutcome { passed: number; failed: number; error: number }

export interface ReplaySummary {
  turnCount: number;
  participantCount: number;
  durationMs: number;
  averageTurnMs: number;
  submittedTurns: number;
  timeoutTurns: number;
  openTurns: number;
  longestTurn: { turnId: string; turnNumber: number; durationMs: number } | null;
  executions: { total: number; success: number; failed: number; timeout: number };
  missions: Record<string, MissionOutcome>;
  codeChanges: { addedLines: number; removedLines: number };
}

export function summarizeReplay(timeline: ReplayTimeline): ReplaySummary {
  const summary: ReplaySummary = {
    turnCount: timeline.turns.length, participantCount: timeline.segments.length, durationMs: timeline.durationMs,
    averageTurnMs: 0, submittedTurns: 0, timeoutTurns: 0, openTurns: 0, longestTurn: null,
    executions: { total: 0, success: 0, failed: 0, timeout: 0 }, missions: {}, codeChanges: { addedLines: 0, removedLines: 0 },
  };

  let totalTurnMs = 0;
  for (const turn of timeline.turns) {
    const durationMs = turn.endOffsetMs - turn.startOffsetMs;
    totalTurnMs += durationMs;
    if (turn.status === 'SUBMITTED') summary.submittedTurns++;
    else if (turn.status === 'TIMEOUT') summary.timeoutTurns++;
    else summary.openTurns++;
    if (!summary.longestTurn || durationMs > summary.longestTurn.durationMs) {
      summary.longestTurn = { turnId: turn.turnId, turnNumber: turn.turnNumber, durationMs };
    }
  }
  summary.averageTurnMs = summary.turnCount ? Math.round(totalTurnMs / summary.turnCount) : 0;

  for (const event of timeline.events) {
    if (event.type === 'EXECUTION_END') {
      summary.executions.total++;
      if (event.status === 'SUCCESS') summary.executions.success++;
      else if (event.status === 'TIMEOUT') summary.executions.timeout++;
      else if (event.status === 'FAILED') summary.executions.failed++;
    } else if (event.type === 'MISSION_RESULT') {
      const outcome = (summary.missions[event.missionId] ??= { passed: 0, failed: 0, error: 0 });
      if (event.judgeStatus === 'PASSED') outcome.passed++;
      else if (event.judgeStatus === 'FAILED') outcome.failed++;
      else outcome.error++;
    } else if (event.type === 'CODE_CHANGE') {
      summary.codeChanges.addedLines += event.summary.addedLines;
      summary.codeChanges.removedLines += event.summary.removedLines;
    }
  }
  return summary;
}
