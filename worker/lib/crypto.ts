/**
 * Field-level encryption and hashing for sensitive applicant data.
 *
 * The Worker encrypts sensitive values with AES-256-GCM before they are sent to
 * Supabase, so the database at rest holds ciphertext instead of a plaintext ID
 * or passport number. Supabase's own storage encryption covers the volume; this
 * adds a layer whose key lives only in Cloudflare, never in Supabase.
 *
 * What this does and does not protect:
 *  - Protects: a database dump, a Supabase backup, a leaked dashboard session
 *    or a compromised Supabase credential, because the key is not in Supabase.
 *  - Does not protect: a compromised Worker environment or FIELD_ENCRYPTION_KEY.
 *  - The key is not rotated automatically. Rotating it means re-encrypting the
 *    `id_number` column; the hash column is unaffected because it never holds
 *    the key material.
 */

const IV_BYTES = 12;
const KEY_BYTES = 32;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Copies bytes into a plain ArrayBuffer.
 *
 * Web Crypto and Blob both want an ArrayBuffer rather than a possibly shared
 * view of one, and being explicit here keeps the call sites free of casts.
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function decodeKey(keyBase64: string): Uint8Array {
  const bytes = base64ToBytes(keyBase64.trim());
  if (bytes.length !== KEY_BYTES) {
    throw new Error(`FIELD_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${bytes.length}`);
  }
  return bytes;
}

export function generateKeyBase64(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(decodeKey(keyBase64)), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Returns base64(iv || ciphertext), safe to store in a text column. */
export async function encryptField(plaintext: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(new TextEncoder().encode(plaintext)),
    ),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64(combined);
}

export async function decryptField(payload: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const combined = base64ToBytes(payload);
  const iv = combined.subarray(0, IV_BYTES);
  const ciphertext = combined.subarray(IV_BYTES);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(new TextEncoder().encode(value)));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** ID numbers are compared and hashed in a single canonical form. */
export function normaliseIdNumber(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export async function hashIdNumber(value: string): Promise<string> {
  return sha256Hex(normaliseIdNumber(value));
}

export function uuid(): string {
  return crypto.randomUUID();
}
