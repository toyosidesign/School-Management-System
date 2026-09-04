/**
 * Generates a strong JWT signing key into server/.env, creating the file from
 * .env.example if it does not exist. Never overwrites an existing secret unless
 * --force is passed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env');
const examplePath = path.join(__dirname, '../../.env.example');
const force = process.argv.includes('--force');

let env = fs.existsSync(envPath)
  ? fs.readFileSync(envPath, 'utf8')
  : fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '';

const current = env.match(/^JWT_SECRET=(.*)$/m)?.[1]?.trim();
const isPlaceholder = !current || current === 'change-me-in-production' || current === 'dev-secret-change-me';

if (current && !isPlaceholder && !force) {
  console.log('  JWT_SECRET is already set. Pass --force to replace it (this signs every session out).');
  process.exit(0);
}

const secret = crypto.randomBytes(48).toString('base64url');
env = env.match(/^JWT_SECRET=.*$/m)
  ? env.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
  : `${env.trimEnd()}\nJWT_SECRET=${secret}\n`;

fs.writeFileSync(envPath, env.trimStart(), { mode: 0o600 });
fs.chmodSync(envPath, 0o600);

console.log(`
  Wrote a new JWT_SECRET to server/.env (permissions set to 0600).

  ${secret.slice(0, 12)}...${secret.slice(-6)}  (${secret.length} characters)

  Keep this out of version control. Rotating it signs every user out.
`);
