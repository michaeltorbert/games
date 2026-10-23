// Cloudflare Access JWT verification. The header's presence proves nothing: the token's
// RS256 signature must verify against the team's published keys, and its issuer,
// audience and times must match. The identity claim is used only to bind CSRF and
// confirmation tokens to this session (hashed) and is never stored or logged.
import { fromBase64url, sha256Hex } from './tokens.js';

const decoder = new TextDecoder();
const LEEWAY_S = 60, KEYS_TTL_MS = 10 * 60 * 1000, REFRESH_MIN_MS = 30 * 1000, MAX_TOKEN = 8192;
const caches = new Map();

const segment = value => {
  const bytes = fromBase64url(value);
  if (!bytes) return null;
  try { return JSON.parse(decoder.decode(bytes)); } catch (error) { return null; }
};

// workerd accepts only redirect 'follow' or 'manual' ('error' throws before any request),
// so redirects are taken manually and anything but 200 is refused: never followed.
async function fetchKeys(team, fetcher) {
  const response = await fetcher(`${team}/cdn-cgi/access/certs`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  if (response.status !== 200) throw new Error('certs-status');
  const body = await response.json();
  const keys = new Map();
  for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
    if (jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue;
    if (jwk.alg !== undefined && jwk.alg !== 'RS256') continue;
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    keys.set(jwk.kid, key);
  }
  return keys;
}

// The key for `kid`, refreshing the cached set when it is stale or the kid is unknown
// (key rotation), but at most once per REFRESH_MIN_MS so forged kids cannot hammer it.
async function keyFor(team, kid, fetcher, now) {
  let cache = caches.get(team);
  const stale = !cache || now - cache.fetchedAt > KEYS_TTL_MS;
  if (stale || (!cache.keys.has(kid) && now - cache.fetchedAt > REFRESH_MIN_MS)) {
    try {
      cache = { keys: await fetchKeys(team, fetcher), fetchedAt: now };
      caches.set(team, cache);
    } catch (error) {
      if (!cache || stale) return { error: 'certs-unavailable' };
    }
  }
  const key = cache.keys.get(kid);
  return key ? { key } : { error: 'unknown-key' };
}

export function resetAccessCache() {
  caches.clear();
}

// Returns {ok: true, session} or {ok: false, reason, status}.
export async function verifyAccess(request, config, { fetcher = fetch, now = Date.now() } = {}) {
  if (!config.accessReady) return { ok: false, reason: 'access-not-configured', status: 503 };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, reason: 'missing', status: 401 };
  if (token.length > MAX_TOKEN) return { ok: false, reason: 'malformed', status: 401 };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed', status: 401 };
  const header = segment(parts[0]), claims = segment(parts[1]), signature = fromBase64url(parts[2]);
  if (!header || !claims || !signature || signature.length === 0) return { ok: false, reason: 'malformed', status: 401 };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 128
    || (header.typ !== undefined && header.typ !== 'JWT') || header.crit !== undefined) return { ok: false, reason: 'algorithm', status: 401 };
  const found = await keyFor(config.team, header.kid, fetcher, now);
  if (found.error) return { ok: false, reason: found.error, status: found.error === 'certs-unavailable' ? 503 : 401 };
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', found.key, signature, signed);
  if (!valid) return { ok: false, reason: 'signature', status: 401 };
  const seconds = Math.floor(now / 1000);
  if (claims.iss !== config.team) return { ok: false, reason: 'issuer', status: 401 };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.aud)) return { ok: false, reason: 'audience', status: 401 };
  if (!Number.isFinite(claims.exp) || claims.exp + LEEWAY_S < seconds) return { ok: false, reason: 'expired', status: 401 };
  if (claims.nbf !== undefined && !(Number.isFinite(claims.nbf) && claims.nbf - LEEWAY_S <= seconds)) return { ok: false, reason: 'not-yet-valid', status: 401 };
  if (claims.iat !== undefined && !(Number.isFinite(claims.iat) && claims.iat - LEEWAY_S <= seconds)) return { ok: false, reason: 'issued-in-future', status: 401 };
  if (typeof claims.sub !== 'string' || !claims.sub) return { ok: false, reason: 'subject', status: 401 };
  return { ok: true, session: await sha256Hex(`${claims.sub}|${claims.iat ?? ''}`) };
}
