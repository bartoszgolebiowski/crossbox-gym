import { createHash, createHmac } from 'crypto';

/** Hash API key using SHA-256 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/** Compute HMAC signature for QR code payload verification */
export function signQrPayload(userId: string, timestamp: number, secretKey: string): string {
  return createHmac('sha256', secretKey).update(`${userId}:${timestamp}`).digest('hex');
}
