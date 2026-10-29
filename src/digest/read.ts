import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

export type { DigestNight, DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

// Parse at the edge: JSON that does not parse, and JSON that parses but is not a run line, are
// both bad lines. The caller counts them; nothing here throws.
function parseLine(text: string): RunLine | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;

  const line = data as Record<string, unknown>;
  const at = line.at;
  const job = line.job;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job.trim() === '') return null;
  if (!isStatus(line.status)) return null;

  return {
    at,
    job,
    status: line.status,
    owner: typeof line.owner === 'string' && line.owner.trim() !== '' ? line.owner : null,
    error: typeof line.error === 'string' ? line.error : null,
  };
}

// One job's running row. The `*At` fields are epoch ms used only to compare; the row keeps the
// log's own `at` strings, offsets and all (docs/styleguide.md).
type Acc = {
  row: DigestRow;
  firstAt: number;
  lastAt: number;
  ownerAt: number;
};

function fold(acc: Acc, run: RunLine, at: number): void {
  const { row } = acc;
  row.runs += 1;
  if (run.status === 'retry') row.retries += 1;

  // The last run's own status and error. On a tie, the line later in the file wins.
  if (at >= acc.lastAt) {
    row.lastStatus = run.status;
    row.lastError = run.error;
    row.last = run.at;
    acc.lastAt = at;
  }
  if (at < acc.firstAt) {
    row.first = run.at;
    acc.firstAt = at;
  }
  // A row keeps an owner if any run had one; the most recent such owner wins.
  if (run.owner !== null && at >= acc.ownerAt) {
    row.owner = run.owner;
    acc.ownerAt = at;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw err;
  }

  const accs = new Map<string, Acc>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const run = parseLine(raw);
    if (run === null) {
      badLines += 1;
      continue;
    }

    const at = Date.parse(run.at);
    let acc = accs.get(run.job);
    if (acc === undefined) {
      acc = {
        row: {
          job: run.job,
          owner: null,
          runs: 0,
          retries: 0,
          lastStatus: run.status,
          lastError: run.error,
          first: run.at,
          last: run.at,
        },
        firstAt: at,
        lastAt: at,
        ownerAt: Number.NEGATIVE_INFINITY,
      };
      accs.set(run.job, acc);
    }
    fold(acc, run, at);
  }

  const rows = [...accs.values()]
    .map((acc) => acc.row)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines };
};
