import assert from 'node:assert/strict';
import test from 'node:test';
import { MemberRepository, StoredInvoice } from '../lib/handlers/member/repository';
import { MemberService } from '../lib/handlers/member/service';
import { PaymentProvider } from '../lib/handlers/shared/payment';
import { SubscriptionItem, UserItem } from '../lib/handlers/shared/types';

const activeSubscription: SubscriptionItem = {
  PK: 'USER#member-1',
  SK: 'SUB#subscription-1',
  stripe_subscription_id: 'subscription-1',
  stripe_customer_id: 'customer-1',
  status: 'ACTIVE',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

class FakeMemberRepository implements MemberRepository {
  subscription: SubscriptionItem | undefined = activeSubscription;
  configValue: string | undefined = 'test-hmac-key';
  storedInvoices: StoredInvoice[] = [];
  consent?: { userId: string; termsVersion: string; ipAddress: string; acceptedAt: string };

  async getUserProfile(): Promise<UserItem | undefined> {
    return undefined;
  }

  async getUserSubscription(): Promise<SubscriptionItem | undefined> {
    return this.subscription;
  }

  async listLocations() {
    return [];
  }

  async recordConsent(params: {
    userId: string;
    termsVersion: string;
    ipAddress: string;
    acceptedAt: string;
  }): Promise<void> {
    this.consent = params;
  }

  async getConfigValue(): Promise<string | undefined> {
    return this.configValue;
  }

  async listStoredInvoices(): Promise<StoredInvoice[]> {
    return this.storedInvoices;
  }
}

class FakePaymentProvider implements PaymentProvider {
  async createCheckoutSession(): Promise<{ url: string }> {
    return { url: 'https://payments.example.test/checkout' };
  }

  async createPortalSession(): Promise<{ url: string }> {
    return { url: 'https://payments.example.test/portal' };
  }

  async listInvoices() {
    return [];
  }
}

test('MemberService generates a deterministic short-lived QR code through injected dependencies', async () => {
  const repository = new FakeMemberRepository();
  const service = new MemberService({
    repository,
    paymentProvider: new FakePaymentProvider(),
    frontendUrl: 'https://app.example.test',
    now: () => new Date('2026-08-04T12:00:00.000Z'),
    signQr: (userId, timestamp, secret) => `${userId}:${timestamp}:${secret}`,
  });

  const result = await service.createQrCode('member-1');

  assert.deepEqual(JSON.parse(result.qr_code), {
    user_id: 'member-1',
    timestamp: 1785844800,
    hmac: 'member-1:1785844800:test-hmac-key',
  });
  assert.equal(result.expires_in, 60);
});

test('MemberService rejects QR generation without a configured signing key', async () => {
  const repository = new FakeMemberRepository();
  repository.configValue = undefined;
  const service = new MemberService({
    repository,
    paymentProvider: new FakePaymentProvider(),
    frontendUrl: 'https://app.example.test',
  });

  await assert.rejects(() => service.createQrCode('member-1'), /HMAC_CURRENT_KEY configuration is required/);
});
