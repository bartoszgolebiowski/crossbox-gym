import { signQrPayload } from '../../crypto';
import { IProvider, ProviderId, VerificationResult } from '../types';

interface BasicQrPayload {
  user_id: string;
  timestamp: number;
  hmac: string;
}

export type KeyFetcher = () => Promise<{ currentKey: string; previousKey?: string }>;
export type SubscriptionFetcher = (
  userId: string
) => Promise<{ status: string; grace_period_end?: string } | undefined>;

const missingKeyFetcher: KeyFetcher = async () => {
  throw new Error('QR signing-key fetcher is required');
};

const missingSubscriptionFetcher: SubscriptionFetcher = async () => {
  throw new Error('Subscription fetcher is required');
};

export class BasicSubscriptionProvider implements IProvider {
  readonly id: ProviderId = 'basic-subscription';

  constructor(
    private readonly keyFetcher: KeyFetcher = missingKeyFetcher,
    private readonly subscriptionFetcher: SubscriptionFetcher = missingSubscriptionFetcher
  ) {}

  private async getKeys(): Promise<{ currentKey: string; previousKey?: string }> {
    return this.keyFetcher();
  }

  private async getSubscription(userId: string) {
    return this.subscriptionFetcher(userId);
  }

  canHandle(rawData: string): boolean {
    if (typeof rawData !== 'string' || !rawData.trim().startsWith('{')) return false;
    try {
      const parsed = JSON.parse(rawData);
      return typeof parsed === 'object' && parsed !== null && ('user_id' in parsed || 'hmac' in parsed);
    } catch {
      return false;
    }
  }

  async verify(rawData: string, context?: Record<string, unknown>): Promise<VerificationResult> {
    if (!this.canHandle(rawData)) {
      return { success: false, reason: 'unrecognized_format' };
    }

    try {
      const payload = JSON.parse(rawData) as Partial<BasicQrPayload>;

      if (
        typeof payload.user_id !== 'string' ||
        typeof payload.timestamp !== 'number' ||
        typeof payload.hmac !== 'string'
      ) {
        return { success: false, reason: 'invalid_payload_structure' };
      }

      const now =
        typeof context?.nowSeconds === 'number' ? (context.nowSeconds as number) : Math.floor(Date.now() / 1000);
      if (Math.abs(now - payload.timestamp) > 60) {
        return { success: false, reason: 'qr_expired' };
      }

      const { currentKey, previousKey } = await this.getKeys();

      const currentHmac = signQrPayload(payload.user_id, payload.timestamp, currentKey);
      const previousHmac = previousKey ? signQrPayload(payload.user_id, payload.timestamp, previousKey) : undefined;

      if (payload.hmac !== currentHmac && payload.hmac !== previousHmac) {
        return { success: false, reason: 'invalid_hmac' };
      }

      const subscription = await this.getSubscription(payload.user_id);
      const subscriptionActive =
        subscription?.status === 'ACTIVE' ||
        (subscription?.status === 'PAST_DUE' &&
          subscription.grace_period_end &&
          new Date(subscription.grace_period_end).getTime() / 1000 > now);

      if (!subscriptionActive) {
        return { success: false, reason: 'subscription_inactive' };
      }

      return {
        success: true,
        credential: {
          subjectId: payload.user_id,
          providerId: this.id,
          metadata: { timestamp: payload.timestamp },
        },
      };
    } catch (err) {
      return { success: false, reason: 'malformed_json_payload' };
    }
  }
}
