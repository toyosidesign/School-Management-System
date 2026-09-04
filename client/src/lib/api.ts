const TOKEN_KEY = 'sms.token';
const SCHOOL_KEY = 'sms.school';

/**
 * Which school this browser is looking at.
 *
 * In production the subdomain says it and the server never has to be told. On a
 * bare host — a laptop, an IP address, a preview build — there is no subdomain
 * to read, so the school travels in a header instead. It is remembered so the
 * answer survives a reload without hanging ?school= off every link.
 */
export function currentSchool(): string | null {
  const asked = new URLSearchParams(location.search).get('school');
  if (asked) {
    localStorage.setItem(SCHOOL_KEY, asked);
    return asked;
  }
  return localStorage.getItem(SCHOOL_KEY);
}

export const setSchool = (slug: string | null) =>
  slug ? localStorage.setItem(SCHOOL_KEY, slug) : localStorage.removeItem(SCHOOL_KEY);

/** Where a school lives: its own subdomain where there is one to give it. */
export function schoolUrl(slug: string, path = '/login') {
  const host = location.hostname;
  const bare = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (bare) return `${location.origin}${path}?school=${encodeURIComponent(slug)}`;

  const parts = host.split('.');
  const root = parts.length > 2 ? parts.slice(1).join('.') : host;
  return `${location.protocol}//${slug}.${root}${location.port ? `:${location.port}` : ''}${path}`;
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  /** The whole response, for endpoints that answer a refusal with detail. */
  body: any;
  constructor(message: string, status: number, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const isForm = options.body instanceof FormData;

  const school = currentSchool();

  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(school ? { 'X-School': school } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    setToken(null);
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  const text = await res.text();
  const data = text ? safeParse(text) : null;

  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data);
  return data;
}

function safeParse(text: string) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) =>
    request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: (path: string, body?: any) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: (path: string, body?: any) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};

/** Query-string helper that drops empty values. */
export const qs = (params: Record<string, any>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};
