import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestNight } from '../src/digest/types.js';

const made: string[] = [];

// runs/ is real data and read-only: every synthetic night gets its own temp dir.
function runsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  made.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

function night(dir: string, name: string): DigestNight {
  const read = readNight(dir, name);
  if (read === null) throw new Error(`${name} read as missing`);
  return read;
}

const line = (job: string, at: string, status: string, owner: string | null, error?: string) =>
  `${JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) })}\n`;

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real night into one row per job, sorted by job', () => {
    const read = night('runs', '2026-10-28');

    expect(read.badLines).toBe(1);
    expect(read.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const sync = read.rows[2];
    expect(sync).toMatchObject({
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      first: '2026-10-28T23:00:06+01:00',
      last: '2026-10-29T05:00:04+01:00',
    });

    const refresh = read.rows[1];
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });

    const backup = read.rows[3];
    expect(backup).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps the offset from the log, never UTC', () => {
    const read = night('runs', '2026-10-28');
    for (const row of read.rows) {
      expect(row.first).toMatch(/\+01:00$/);
      expect(row.last).toMatch(/\+01:00$/);
    }
  });

  it('keeps a row whose owner is null', () => {
    const read = night('runs', '2026-10-28');
    const render = read.rows[0];
    expect(render.job).toBe('digest/render');
    expect(render.owner).toBeNull();
    expect(render.runs).toBe(1);
  });

  it('counts a bad line and still reads the rest of the night', () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        line('lane/sync', '2026-10-28T23:00:00+01:00', 'ok', 'rook'),
        '{"at":"2026-10-29T05:59:58+01:00","job":"lane/sy\n',
        '{"at":"2026-10-29T01:00:00+01:00","job":"notes/backup","status":"fail"}\n',
        'not json at all\n',
        JSON.stringify({ at: 'sometime', job: 'lane/sync', status: 'ok' }) + '\n',
      ].join(''),
    });

    const read = night(dir, '2026-10-28');
    expect(read.badLines).toBe(3);
    expect(read.rows).toHaveLength(2);
    expect(read.rows.map((row) => row.job)).toEqual(['lane/sync', 'notes/backup']);
  });

  it('counts every line of a night that is all bad, and returns no rows', () => {
    const dir = runsDir({ '2026-10-28.jsonl': '{}\n{oops\n' });
    const read = night(dir, '2026-10-28');
    expect(read.badLines).toBe(2);
    expect(read.rows).toEqual([]);
  });

  it('does not throw on a night with no file', () => {
    const dir = runsDir({ '2026-10-27.jsonl': line('lane/sync', '2026-10-27T23:00:00+01:00', 'ok', 'rook') });
    expect(readNight(dir, '2026-10-28')).toBeNull();
    expect(readNight(join(dir, 'no-such-dir'), '2026-10-28')).toBeNull();
    expect(readNight(dir, '../2026-10-27')).toBeNull();
  });

  it('reads an empty night as no rows, not as a missing night', () => {
    const read = night(runsDir({ '2026-10-28.jsonl': '' }), '2026-10-28');
    expect(read).toEqual({ night: '2026-10-28', rows: [], badLines: 0 });
  });

  it('keeps the latest status and error of a job and the earliest first time', () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        line('lane/sync', '2026-10-28T01:00:00+01:00', 'retry', null, 'lock held'),
        line('lane/sync', '2026-10-28T02:00:00+01:00', 'ok', 'rook'),
        line('lane/sync', '2026-10-27T23:00:00+01:00', 'ok', 'rook'),
      ].join(''),
    });

    const [sync] = night(dir, '2026-10-28').rows;
    expect(sync).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 3,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      first: '2026-10-27T23:00:00+01:00',
      last: '2026-10-28T02:00:00+01:00',
    });
  });
});
