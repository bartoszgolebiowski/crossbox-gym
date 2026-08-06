import { signQrPayload } from '../shared/crypto';
import { ValidationError } from '../shared/http';
import { PaymentProvider } from '../shared/payment';
import { MemberRepository } from './repository';

export interface MemberServiceDependencies {
  repository: MemberRepository;
  paymentProvider: PaymentProvider;
  frontendUrl: string;
  now?: () => Date;
  signQr?: (userId: string, timestamp: number, secret: string) => string;
}

export class MemberService {
  private readonly now: () => Date;
  private readonly signQr: (userId: string, timestamp: number, secret: string) => string;

  constructor(private readonly dependencies: MemberServiceDependencies) {
    this.now = dependencies.now || (() => new Date());
    this.signQr = dependencies.signQr || signQrPayload;
  }

  async getDashboard(userId: string) {
    const [user, subscription, locations] = await Promise.all([
      this.dependencies.repository.getUserProfile(userId),
      this.dependencies.repository.getUserSubscription(userId),
      this.dependencies.repository.listLocations(),
    ]);
    return { user, subscription, locations };
  }

  async recordConsent(userId: string, termsVersion: string, ipAddress: string) {
    await this.dependencies.repository.recordConsent({
      userId,
      termsVersion,
      ipAddress,
      acceptedAt: this.now().toISOString(),
    });
    return { message: 'Consent recorded successfully' };
  }

  async createQrCode(userId: string) {
    const subscription = await this.dependencies.repository.getUserSubscription(userId);
    if (!subscription) {
      throw new ValidationError('Active subscription required to generate QR code');
    }

    const timestamp = Math.floor(this.now().getTime() / 1000);
    const isActive =
      subscription.status === 'ACTIVE' ||
      (subscription.status === 'PAST_DUE' &&
        subscription.grace_period_end &&
        new Date(subscription.grace_period_end).getTime() / 1000 > timestamp);
    if (!isActive) {
      throw new ValidationError('Subscription is inactive or grace period expired');
    }

    const signingKey = await this.dependencies.repository.getConfigValue('HMAC_CURRENT_KEY');
    if (!signingKey) {
      throw new Error('HMAC_CURRENT_KEY configuration is required to generate QR codes');
    }

    return {
      qr_code: JSON.stringify({
        user_id: userId,
        timestamp,
        hmac: this.signQr(userId, timestamp, signingKey),
      }),
      expires_in: 60,
    };
  }

  async createPortalSession(userId: string, requestedReturnUrl?: string) {
    const subscription = await this.dependencies.repository.getUserSubscription(userId);
    if (!subscription?.stripe_customer_id) {
      throw new ValidationError('No Stripe customer ID found for member');
    }

    const returnUrl = requestedReturnUrl || `${this.dependencies.frontendUrl.replace(/\/$/, '')}/member/dashboard`;
    return this.dependencies.paymentProvider.createPortalSession({
      customerId: subscription.stripe_customer_id,
      returnUrl,
    });
  }

  async getInvoices(userId: string) {
    const storedInvoices = await this.dependencies.repository.listStoredInvoices(userId);
    if (storedInvoices.length > 0) {
      return { invoices: storedInvoices };
    }

    const subscription = await this.dependencies.repository.getUserSubscription(userId);
    if (!subscription?.stripe_customer_id) {
      return { invoices: [] };
    }

    try {
      return {
        invoices: await this.dependencies.paymentProvider.listInvoices({ customerId: subscription.stripe_customer_id }),
      };
    } catch (error) {
      console.error('Invoice retrieval error:', error);
      return { invoices: [] };
    }
  }
}
