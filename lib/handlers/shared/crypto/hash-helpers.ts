import { createHmac } from 'crypto';

/** Compute HMAC signature for QR code payload verification */
export function signQrPayload(userId: string, timestamp: number, secretKey: string): string {
  return createHmac('sha256', secretKey).update(`${userId}:${timestamp}`).digest('hex');
}
