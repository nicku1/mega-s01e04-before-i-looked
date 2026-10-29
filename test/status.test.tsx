import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest, counts beside it', async () => {
    const res = await createApp(config).request('/');
    const html = await res.text();

    // The counts are over rows: the job's own lastStatus is what counts, not its runs.
    const counts = (night: string) =>
      html.match(new RegExp(`<a href="/digest/${night}">${night}</a> <span class="mute">([^<]*)</span>`))?.[1];

    expect(counts('2026-10-28')).toBe('ok 4 · retry 0 · fail 1');
    expect(counts('2026-10-27')).toBe('ok 4 · retry 0 · fail 0');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
