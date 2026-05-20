// crypto.js — Passphrase-derived API key encryption for Total Recall.
//
// Uses Web Crypto API (built into all modern browsers; no dependencies).
// PBKDF2-SHA256 at 100,000 iterations derives a 256-bit AES-GCM key from
// the user's passphrase. The derived key encrypts the API key with a
// random 12-byte IV. The salt, IV, and ciphertext are stored together in
// chrome.storage.local; the derived key itself is cached in
// chrome.storage.session (memory-only — never written to disk) for the
// browser session so the user enters the passphrase once per restart.
//
// Storage layout when encryption is enabled:
//   chrome.storage.local['llm-api-key-encrypted'] = { salt, iv, ciphertext }
//   chrome.storage.local['llm-encryption-enabled'] = true
//   chrome.storage.local['llm-api-key'] = '' (wiped)
//   chrome.storage.session['derived-key'] = <base64 raw 32-byte key>
//
// Threat model: protects against passive filesystem attackers who can read
// the on-disk Chrome profile. Does NOT protect against active attackers who
// can run code as your OS user (those can keylog the passphrase or read
// memory). Does NOT protect against a compromised extension build.

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;

// --- Public surface --------------------------------------------------------

// Encrypts plaintext with a passphrase. Returns the salt, IV, and ciphertext
// as base64 strings — serialisable for chrome.storage.local.
export async function encryptString(plaintext, passphrase) {
  if (typeof plaintext !== 'string' || !plaintext) throw new Error('plaintext required');
  if (typeof passphrase !== 'string' || !passphrase) throw new Error('passphrase required');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv   = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key  = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

// Decrypts a {salt, iv, ciphertext} bundle with the passphrase.
// Throws on wrong passphrase or corrupted ciphertext.
export async function decryptString(envelope, passphrase) {
  if (!envelope || typeof envelope !== 'object') throw new Error('envelope required');
  if (typeof passphrase !== 'string' || !passphrase) throw new Error('passphrase required');

  const salt       = base64ToBytes(envelope.salt);
  const iv         = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key        = await deriveKey(passphrase, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

// Same as decryptString but uses an already-imported CryptoKey (from session cache).
// Skips the slow PBKDF2 step. Throws on wrong key / corrupted ciphertext.
export async function decryptWithKey(envelope, cryptoKey) {
  const iv         = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const plaintext  = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

// Derive the AES-GCM key from passphrase + salt. Returns a CryptoKey.
// Exposed so callers can derive once + cache the result.
export async function deriveKey(passphrase, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    true,                       // extractable — needed for session caching
    ['encrypt', 'decrypt']
  );
}

// Export a CryptoKey to a base64 string for storage in chrome.storage.session.
export async function exportKeyToBase64(cryptoKey) {
  const raw = await crypto.subtle.exportKey('raw', cryptoKey);
  return bytesToBase64(new Uint8Array(raw));
}

// Import a base64-stored key back to a CryptoKey usable for decrypt.
export async function importKeyFromBase64(base64Key) {
  return await crypto.subtle.importKey(
    'raw',
    base64ToBytes(base64Key),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// --- Internals -------------------------------------------------------------

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
