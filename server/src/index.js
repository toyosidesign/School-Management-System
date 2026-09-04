import 'dotenv/config';
import { createApp } from './app.js';
import { assertProductionSecrets } from './lib/security.js';

assertProductionSecrets();

// On the demo deployment, seed a full demo school into an empty default
// database, so the site's own address is a live, populated school rather than
// an empty one. Guarded by emptiness (a real single-school install is never
// wiped) and by the flag (it runs only where asked). On an ephemeral host this
// re-seeds a clean demo on every cold start, which is exactly what a demo wants.
if (process.env.SEED_DEMO === 'true') {
  const { defaultDb, migrate } = await import('./db/index.js');
  migrate();
  if (defaultDb.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
    console.log('\n  Empty database: seeding the demo school...');
    await import('./db/seed.js'); // self-executing: drops, migrates, seeds
  }
}

const PORT = process.env.PORT || 4000;

createApp().listen(PORT, () => {
  console.log(`\n  K-12 School Management API  ->  http://localhost:${PORT}/api/health\n`);
});
