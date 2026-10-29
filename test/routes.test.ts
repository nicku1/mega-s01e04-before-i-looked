import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestNight } from '../src/digest/types.js';

// runs/ is real data and read-only: every synthetic night gets its own temp dir under the
// worktree, injected into createApp through its own RigConfig. Nothing here touches runs/ for
// writing, and the temp dirs are removed after the tests.
const made: string[] = [];

function runsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(process.cwd(), 'test', '.runs-tmp-'));
  made.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

const real28 = readFileSync(join(process.cwd(), 'runs', '2026-10-28.jsonl'), 'utf8');

const jobs28 = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

function appFor(runsDir: string) {
  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return createApp(config);
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('the real night → 200 with job names and badLines context', async () => {
    const dir = runsDir({ '2026-10-28.jsonl': real28 });
    const res = await appFor(dir).request('/digest/2026-10-28');

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('digest · 2026-10-28');
    for (const job of jobs28) expect(html).toContain(job);
    // The real night has 5 jobs, 1 bad line.
    expect(html).toContain('1 line did not parse');
  });

  it('a night with no file → 404', async () => {
    const dir = runsDir({ '2026-10-27.jsonl': '{"at":"2026-10-27T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n' });
    const res = await appFor(dir).request('/digest/2026-10-29');
    expect(res.status).toBe(404);
  });

  it('an empty night → 200 with "nothing ran"', async () => {
    const dir = runsDir({ '2026-10-28.jsonl': '' });
    const res = await appFor(dir).request('/digest/2026-10-28');

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
  });

  it('a night with a bad line → 200, rows render, bad line noted', async () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        '{"at":"2026-10-28T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n',
        '{"at":"2026-10-29T05:59:58+01:00","job":"lane/sy\n', // truncated: bad line
        '{"at":"2026-10-28T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}\n',
      ].join(''),
    });
    const res = await appFor(dir).request('/digest/2026-10-28');

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('lane/sync');
    expect(html).toContain('notes/backup');
    expect(html).toContain('did not parse');
  });
});

describe('GET /api/digest/:night', () => {
  it('the real night → 200 DigestNight JSON', async () => {
    const dir = runsDir({ '2026-10-28.jsonl': real28 });
    const res = await appFor(dir).request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(jobs28);
  });

  it('a night with no file → 404 { error }', async () => {
    const dir = runsDir({ '2026-10-27.jsonl': '{"at":"2026-10-27T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n' });
    const res = await appFor(dir).request('/api/digest/2026-10-29');

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: 'no such night' });
  });

  it('an empty night → 200 { night, rows: [], badLines: 0 }', async () => {
    const dir = runsDir({ '2026-10-28.jsonl': '' });
    const res = await appFor(dir).request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body).toEqual({ night: '2026-10-28', rows: [], badLines: 0 });
  });

  it('a night with a bad line → 200, rows render, badLines counted', async () => {
    const dir = runsDir({
      '2026-10-28.jsonl': [
        '{"at":"2026-10-28T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n',
        '{"at":"2026-10-29T05:59:58+01:00","job":"lane/sy\n', // truncated: bad line
        '{"at":"2026-10-28T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}\n',
      ].join(''),
    });
    const res = await appFor(dir).request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(['lane/sync', 'notes/backup']);
  });
});
