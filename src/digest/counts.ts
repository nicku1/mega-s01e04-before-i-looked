import type { DigestRow, RunStatus } from './types.js';

/** A night's rows by how they ended: one row counted once, in one bucket. */
export type StatusCounts = Record<RunStatus, number>;

/**
 * Count rows, not runs. Each row counts once, by its own `lastStatus`, so a job that retried
 * and then succeeded lands in `ok` (its `retries` still says it retried). The three counts
 * therefore add up to the number of rows in the night.
 */
export function countRows(rows: readonly DigestRow[]): StatusCounts {
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of rows) counts[row.lastStatus] += 1;
  return counts;
}
