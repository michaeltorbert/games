// Response helpers and a streamed, capped JSON body reader.

const BASE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...BASE_HEADERS, ...headers },
  });
}

export function text(status, body, contentType, headers = {}) {
  return new Response(body, { status, headers: { 'Content-Type': contentType, ...BASE_HEADERS, ...headers } });
}

// Device endpoints: CORS for exactly one allowlisted origin, no credentials.
export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

const JSON_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;

// Reads at most maxBytes from the request stream, then parses JSON. Never buffers more
// than the cap: an oversized body is cancelled as soon as it crosses it.
export async function readJson(request, maxBytes) {
  if (!JSON_TYPE.test(request.headers.get('Content-Type') ?? '')) return { status: 415, error: 'content-type' };
  const declared = request.headers.get('Content-Length');
  if (declared !== null && !(Number(declared) <= maxBytes)) return { status: 413, error: 'too-large' };
  if (!request.body) return { status: 400, error: 'malformed' };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { status: 413, error: 'too-large' };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch (error) {
    return { status: 400, error: 'malformed' };
  }
}

export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isUuid = value => typeof value === 'string' && UUID.test(value);

// Operational log line: route, outcome and numeric status only. Never IPs, tokens,
// labels, identities or event content.
export function log(route, outcome, status) {
  console.log(JSON.stringify({ service: 'learning-reporting', route, outcome, status }));
}
