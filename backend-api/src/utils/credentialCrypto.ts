/**
 * Field-level AES-256-GCM encryption for integration credentials stored in DB.
 *
 * Key requirement: INTEGRATION_CREDENTIALS_KEY must be exactly 32 bytes (64 hex characters).
 * Example: openssl rand -hex 32
 *
 * Encrypted blob format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * All three components are hex-encoded and joined with colons.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_BYTES = 16;

function getKey(): Buffer {
  const keyHex = process.env.INTEGRATION_CREDENTIALS_KEY;
  if (!keyHex) {
    throw new Error(
      'INTEGRATION_CREDENTIALS_KEY environment variable is not set. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `INTEGRATION_CREDENTIALS_KEY must be exactly 32 bytes (64 hex chars). Got ${key.length} bytes.`,
    );
  }
  return key;
}

/**
 * Encrypts arbitrary JSON-serialisable data with AES-256-GCM.
 * Returns a string in the form "<iv_hex>:<authTag_hex>:<ciphertext_hex>".
 *
 * Throws if INTEGRATION_CREDENTIALS_KEY is missing or wrong length.
 */
export function encryptCredentials(data: unknown): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a blob produced by encryptCredentials().
 * Returns the original value, or null if decryption fails (bad key, corrupted blob, etc.).
 *
 * Note: credentials are never read back from the DB in any API response (INV-SYS-018).
 * This function is provided for completeness / future administrative tooling.
 */
export function decryptCredentials(blob: string): unknown {
  try {
    const key = getKey();
    const parts = blob.split(':');
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}
