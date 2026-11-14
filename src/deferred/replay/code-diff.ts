/**
 * DEFERRED: not wired into the app. Line-based LCS diff used to summarise how the code
 * changed between two consecutive turn-end snapshots.
 */
import type { CodeChangeSummary, DiffHunk, ReplaySnapshotFile } from './replay.types';

type DiffOp = { kind: 'equal' | 'add' | 'remove'; line: string };

/** Above this many DP cells the diff degrades to "replace everything" to bound memory. */
const MAX_LCS_CELLS = 4_000_000;

export function splitLines(content: string): string[] {
  return content === '' ? [] : content.split('\n');
}

export function diffLines(before: string[], after: string[]): DiffOp[] {
  const n = before.length;
  const m = after.length;
  if (n * m > MAX_LCS_CELLS) {
    const removed = before.map((line): DiffOp => ({ kind: 'remove', line }));
    return removed.concat(after.map((line): DiffOp => ({ kind: 'add', line })));
  }

  // lcs[i][j] = LCS length of before[i..] and after[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        before[i] === after[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ kind: 'equal', line: before[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ kind: 'remove', line: before[i++] });
    } else {
      ops.push({ kind: 'add', line: after[j++] });
    }
  }
  while (i < n) ops.push({ kind: 'remove', line: before[i++] });
  while (j < m) ops.push({ kind: 'add', line: after[j++] });
  return ops;
}

/** Groups consecutive non-equal ops into hunks; line numbers are 1-based. */
export function buildHunks(filePath: string, ops: DiffOp[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let oldLine = 1;
  let newLine = 1;
  let current: DiffHunk | null = null;

  for (const op of ops) {
    if (op.kind === 'equal') {
      current = null;
      oldLine++;
      newLine++;
      continue;
    }
    if (!current) {
      current = { filePath, oldStart: oldLine, newStart: newLine, removed: [], added: [] };
      hunks.push(current);
    }
    if (op.kind === 'remove') {
      current.removed.push(op.line);
      oldLine++;
    } else {
      current.added.push(op.line);
      newLine++;
    }
  }
  return hunks;
}

/** Compares two file sets by path. A missing side counts as an empty file. */
export function summarizeCodeChange(
  previous: ReplaySnapshotFile[],
  next: ReplaySnapshotFile[],
): CodeChangeSummary {
  const before = new Map(previous.map((f) => [f.filePath, f.content]));
  const after = new Map(next.map((f) => [f.filePath, f.content]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();

  const summary: CodeChangeSummary = { filesChanged: [], addedLines: 0, removedLines: 0, hunks: [] };
  for (const path of paths) {
    const oldContent = before.get(path) ?? '';
    const newContent = after.get(path) ?? '';
    if (oldContent === newContent) continue;

    const hunks = buildHunks(
      path,
      diffLines(splitLines(oldContent), splitLines(newContent)),
    );
    summary.filesChanged.push(path);
    summary.hunks.push(...hunks);
    for (const hunk of hunks) {
      summary.addedLines += hunk.added.length;
      summary.removedLines += hunk.removed.length;
    }
  }
  return summary;
}
