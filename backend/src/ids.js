import crypto from 'node:crypto';

// 128 random bits, URL-safe. This id is the only key to a session, so it
// must be unguessable.
export const newSessionId = () => crypto.randomBytes(16).toString('base64url');
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{22}$/;

// Short code a person can write down to come back later. No 0/O/1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newResumeCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
