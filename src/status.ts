import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { countRows, type StatusCounts } from './digest/counts.js';
import { readNight } from './digest/read.js';

/**
 * One night on disk, with the counts the board shows beside it. `counts` is null only when the
 * night cannot be read; the board then shows `—` and still links to the digest.
 */
export type NightOnDisk = {
  night: string;
  counts: StatusCounts | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightOnDisk[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// A night that cannot be read keeps its place on the board, with no counts.
function readNightOnDisk(runsDir: string, night: string): NightOnDisk {
  try {
    const read = readNight(runsDir, night);
    return { night, counts: read === null ? null : countRows(read.rows) };
  } catch {
    return { night, counts: null };
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => readNightOnDisk(config.runsDir, night)),
  };
}
