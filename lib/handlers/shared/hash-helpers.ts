import { createHash, createHmac } from 'crypto';

/** Centralized SHA-256 API key hashing used by AdminHandler and VerifyEntry */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/** Generates HMAC signature for QR code payload */
export function signQrPayload(userId: string, timestamp: number, hmacKey: string): string {
  const dataToSign = `${userId}:${timestamp}`;
  return createHmac('sha256', hmacKey).update(dataToSign).digest('hex');
}
