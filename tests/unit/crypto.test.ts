import { describe, expect, it } from 'vitest';
import {
  decryptField,
  decodeKey,
  encryptField,
  generateKeyBase64,
  hashIdNumber,
  normaliseIdNumber,
  sha256Hex,
  toArrayBuffer,
} from '../../worker/lib/crypto';

describe('field encryption', () => {
  const key = 'X7nQ2mVb0dLpR9fT4wYcZsKa1hGjUeOiB3xN6qHr8Sv=';

  it('round trips a value through encrypt and decrypt', async () => {
    const plaintext = '9001015800089';
    const ciphertext = await encryptField(plaintext, key);
    expect(ciphertext).not.toContain(plaintext);
    await expect(decryptField(ciphertext, key)).resolves.toBe(plaintext);
  });

  it('produces a different ciphertext every time for the same input', async () => {
    const first = await encryptField('same input', key);
    const second = await encryptField('same input', key);
    // A random IV per call: identical IDs must not produce identical ciphertext.
    expect(first).not.toBe(second);
    await expect(decryptField(first, key)).resolves.toBe('same input');
    await expect(decryptField(second, key)).resolves.toBe('same input');
  });

  it('fails to decrypt with the wrong key', async () => {
    const ciphertext = await encryptField('secret', key);
    await expect(decryptField(ciphertext, generateKeyBase64())).rejects.toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => decodeKey('dG9vLXNob3J0')).toThrow(/32 bytes/);
  });

  it('generates a valid 32 byte key', () => {
    expect(() => decodeKey(generateKeyBase64())).not.toThrow();
  });
});

describe('id number hashing', () => {
  it('hashes the same number identically regardless of spacing, dashes or case', async () => {
    const a = await hashIdNumber('9001015800089');
    const b = await hashIdNumber(' 900101-5800089 ');
    expect(a).toBe(b);
  });

  it('normalises as expected', () => {
    expect(normaliseIdNumber(' a1-2 3 ')).toBe('A123');
  });

  it('produces a different hash for a different number', async () => {
    expect(await hashIdNumber('9001015800089')).not.toBe(await hashIdNumber('9001015800088'));
  });

  it('hashes to lowercase hex of the expected length', async () => {
    const hash = await sha256Hex('anything');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('toArrayBuffer', () => {
  it('copies the bytes without sharing the original buffer', () => {
    const source = new Uint8Array([1, 2, 3]);
    const buffer = toArrayBuffer(source);
    source[0] = 9;
    expect(new Uint8Array(buffer)[0]).toBe(1);
  });
});
