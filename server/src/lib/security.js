import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

export const DEV_SECRET = 'dev-secret-change-me';
const SECRET = process.env.JWT_SECRET || DEV_SECRET;
const isProd = process.env.NODE_ENV === 'production';
const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

/**
 * Refuses to start in production with a guessable signing key. A shipped default
 * secret means anyone with the source can mint a valid admin token, so this is a
 * hard failure rather than a warning that scrolls past in a deploy log.
 */
export function assertProductionSecrets() {
  if (!isProd) {
    if (SECRET === DEV_SECRET) {
      console.warn('  Warning: using the built-in development JWT secret. Run `npm run init:secrets` before deploying.\n');
    }
    return;
  }
  const problems = [];
  if (!process.env.JWT_SECRET) problems.push('JWT_SECRET is not set');
  else if (process.env.JWT_SECRET === DEV_SECRET) problems.push('JWT_SECRET is still the built-in development value');
  else if (process.env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters');

  if (problems.length) {
    console.error('\n  Refusing to start in production:\n' + problems.map((p) => `    - ${p}`).join('\n') +
                  '\n\n  Run `npm run init:secrets` to generate one.\n');
    process.exit(1);
  }
}

/**
 * Normalises a client address into a rate-limit bucket. IPv6 clients get a
 * whole /64 to themselves, so limiting the full address would be trivially
 * evaded by rotating within that range.
 */
function ipKey(req) {
  const ip = req.ip ?? '';
  if (ip.includes(':')) {
    const clean = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    if (clean.includes(':')) return clean.split(':').slice(0, 4).join(':') + '::/64';
    return clean;
  }
  return ip;
}

/**
 * A school sits behind a single NAT address, so limiting by IP alone throttles
 * the whole site the moment a few dozen people are signed in at once. Signed-in
 * traffic is therefore bucketed per user; only anonymous traffic falls back to IP.
 */
function userOrIpKey(req) {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) {
    try {
      return `u:${jwt.verify(header.slice(7), SECRET).sub}`;
    } catch {
      /* expired or forged: fall through to the IP bucket */
    }
  }
  return `ip:${ipKey(req)}`;
}

const json = (message) => ({ error: message });

/** Generous per-user ceiling: a busy teacher taking a register never approaches it. */
export function apiLimiter() {
  const perUser = num(process.env.RATE_LIMIT_USER, 600);
  const perIp = num(process.env.RATE_LIMIT_ANON, 100);
  return rateLimit({
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: (req) => (req.headers.authorization?.startsWith('Bearer ') ? perUser : perIp),
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: json('Too many requests. Please slow down and try again in a minute.'),
    skip: (req) => req.method === 'OPTIONS' || req.path === '/health',
    // Custom key generator is intentional; the built-in IP validators do not apply.
    validate: false,
  });
}

/** Credential stuffing is an IP-level problem, so this one stays keyed by address. */
export function loginLimiter() {
  return rateLimit({
    windowMs: num(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60_000),
    max: num(process.env.RATE_LIMIT_LOGIN, 10),
    keyGenerator: (req) => `login:${ipKey(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: json('Too many sign-in attempts. Please wait 15 minutes and try again.'),
    // Custom key generator is intentional; the built-in IP validators do not apply.
    validate: false,
  });
}

/**
 * Activation links. The token is 256 bits of randomness, so guessing is not the
 * threat this defends against; it caps someone replaying dead links in bulk.
 * Kept off the login bucket so a failed activation can never lock a school out
 * of signing in, and successful opens are not counted at all: a whole school
 * activating from one address on results day is normal traffic.
 */
export function inviteLimiter() {
  return rateLimit({
    windowMs: num(process.env.RATE_LIMIT_INVITE_WINDOW_MS, 15 * 60_000),
    max: num(process.env.RATE_LIMIT_INVITE, 30),
    keyGenerator: (req) => `invite:${ipKey(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: json('Too many attempts with an invitation link. Please wait 15 minutes and try again.'),
    // Custom key generator is intentional; the built-in IP validators do not apply.
    validate: false,
  });
}

/**
 * Content Security Policy for the app itself. Kept permissive enough for the
 * Vite dev server, tightened in production where the bundle needs neither
 * inline scripts nor eval.
 */
export function contentSecurityPolicy(_req, res, next) {
  const script = isProd ? "'self'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: https://commondatastorage.googleapis.com",
    "connect-src 'self' ws: wss:",
    "frame-src https://www.google.com https://maps.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), payment=()');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * Uploaded files are attacker-controlled bytes served from the application's own
 * origin, where the session token lives. An SVG or HTML file rendered inline
 * there would run as first-party script, so every upload is served sandboxed,
 * never sniffed, and never as a top-level document.
 */
export function uploadHeaders(_req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}

/**
 * Site imagery uploaded by an administrator: logos and page photography.
 * These are validated as real raster images on the way in and have to render
 * inline in an <img>, so they keep the sandbox and nosniff protections but not
 * the attachment disposition. The risk profile is different from pupil
 * submissions, which stay non-renderable.
 */
export function imageHeaders(_req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}
