// Random identifiers, hashes and HMACs (WebCrypto only).

const encoder = new TextEncoder();
export const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromBase64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch (error) {
    return null;
  }
}
export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
export const randomHex = length => hex(randomBytes(length));
export const newUuid = () => crypto.randomUUID();

export async function sha256Hex(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export async function hmacHex(keyHex, message) {
  const keyBytes = Uint8Array.from(keyHex.match(/../g) ?? [], pair => parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))));
}

// Constant-time for equal-length strings; unequal lengths are simply unequal.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

// Device token: lr1_<installation marker>_<256 random bits>. Parseable is not authentic:
// only a stored hash (active or revoked) proves it was issued.
export const TOKEN = /^lr1_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/;
export const newDeviceToken = installation => `lr1_${installation}_${base64url(randomBytes(32))}`;
export function parseBearer(header) {
  const match = /^Bearer (\S+)$/.exec(header ?? '');
  if (!match) return null;
  const token = TOKEN.exec(match[1]);
  return token ? { token: match[1], installation: token[1] } : null;
}

// Enrollment code: 26 Crockford base-32 characters, 130 random bits. Stored only hashed.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export function newEnrollmentCode() {
  const bytes = randomBytes(17);
  let bits = 0, value = 0, code = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && code.length < 26) {
      code += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return code;
}
export const normalizeCode = value => String(value ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
export const formatCode = code => code.match(/.{1,4}/g).join('-');
