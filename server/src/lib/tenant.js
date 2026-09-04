import { AsyncLocalStorage } from 'node:async_hooks';
import { runWithSchool } from '../db/index.js';
import { connectionFor, findSchool } from '../db/registry.js';

/**
 * Which school the current request is for, by name.
 *
 * Held apart from the connection because a session has to be stamped with it: a
 * token is only good at the school it was issued for, and the two databases
 * both have a user 1.
 */
const schoolContext = new AsyncLocalStorage();

export const currentSchool = () => schoolContext.getStore() ?? null;

/**
 * Runs work as a school: its database, and its name on anything issued.
 *
 * Setting a school up happens on the deployment's own address, where no school
 * is current — so the token handed back at the end of it has to be signed from
 * inside the school it belongs to, or it is a session for nowhere.
 */
export const runAsSchool = (school, connection, fn) =>
  schoolContext.run({ slug: school.slug, name: school.name }, () => runWithSchool(connection, fn));

/** Hosts that are the deployment itself rather than a school. */
const BARE = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Which school this request is for.
 *
 * The subdomain says it: northgate.example.com is Northgate. Locally there are
 * no subdomains to speak of, so `?school=` and an `X-School` header say the
 * same thing — the same resolution either way, so what runs in development is
 * what runs in production.
 */
export function schoolFromRequest(req) {
  const header = req.get('x-school') || req.query?.school;
  if (header) return String(header).toLowerCase();

  const host = (req.hostname || '').toLowerCase();
  if (!host || BARE.has(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;

  // The deployment's own address is not a school. On a platform such as Render
  // the app answers at app.onrender.com, which would otherwise read as a school
  // named "app"; naming that host here keeps the deployment bare, so setup runs
  // on it and schools are reached with ?school= until a wildcard domain exists.
  const root = (process.env.APP_HOST || process.env.RENDER_EXTERNAL_HOSTNAME || '').toLowerCase();
  if (root && (host === root || host === `www.${root}`)) return null;

  const parts = host.split('.');
  // A bare domain (example.com) has no school in it; a subdomain of localhost
  // (northgate.localhost) does, which is what makes local development real.
  const enough = host.endsWith('.localhost') ? 2 : 3;
  if (parts.length < enough) return null;

  const [first] = parts;
  return first === 'www' ? null : first;
}

/**
 * Opens the school's own database for the life of the request.
 *
 * A request that names no school falls through to the deployment's default
 * database, which is what a single-school installation is: the same code,
 * without a registry entry.
 */
export function resolveSchool(req, res, next) {
  const slug = schoolFromRequest(req);
  if (!slug) return next();

  const school = findSchool(slug);
  if (!school) {
    return res.status(404).json({ error: `No school at ${slug}` });
  }
  if (school.status !== 'active') {
    return res.status(403).json({ error: `${school.name} is suspended` });
  }

  req.school = { slug: school.slug, name: school.name };
  schoolContext.run(req.school, () => runWithSchool(connectionFor(school), next));
}
