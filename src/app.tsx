import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestBoard } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = readNight(config.runsDir, c.req.param('night'));
    if (night === null) return c.notFound();
    return c.html(
      <Layout title={`digest ${night.night}`} lane={lane()}>
        <DigestBoard night={night} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    // Exactly what readNight returns: same rows, same order, same time strings as the page.
    // A night it cannot read is a 404, and nothing else is.
    const night = readNight(config.runsDir, c.req.param('night'));
    return night === null ? c.json({ error: 'no such night' }, 404) : c.json(night);
  });

  return app;
}
