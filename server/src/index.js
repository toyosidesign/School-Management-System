import 'dotenv/config';
import { createApp } from './app.js';
import { assertProductionSecrets } from './lib/security.js';

assertProductionSecrets();

const PORT = process.env.PORT || 4000;

createApp().listen(PORT, () => {
  console.log(`\n  K-12 School Management API  ->  http://localhost:${PORT}/api/health\n`);
});
