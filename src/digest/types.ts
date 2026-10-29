// The digest's contract. Everything that reads a night's run log imports these names, not the
// shapes of whichever reader happens to exist today. The implementation is ./read.ts.

/** A run's status, as runs/<night>.jsonl writes it. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/**
 * One log line, parsed at the edge and trusted after. `at` is the string the log wrote, offset
 * and all: it is never turned into UTC (docs/styleguide.md).
 */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

/**
 * One row per job. `lastStatus` and `lastError` are the last run's own status and error, so a
 * row that ends `ok` carries no error. `first` and `last` are the earliest and latest `at`
 * seen for the job, as written. A job no run claimed has `owner: null` and renders as `—`.
 */
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  first: string;
  last: string;
};

/**
 * One night's log, read: rows sorted by job, plus how many lines did not parse. Bad lines are
 * counted, never thrown, so the night still renders.
 */
export type DigestNight = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

/**
 * Read `runsDir/<night>.jsonl` into one row per job.
 *
 * - Returns `null` when there is no file for that night (section 2a answers 404). An empty
 *   file is not missing: it reads to `rows: [], badLines: 0`.
 * - Never throws on a line that does not parse; it lands in `badLines` and the rest render.
 * - A `night` that is not `YYYY-MM-DD` reads as `null`, so it can come from a URL safely.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
