import { ValidationError } from '../shared/http';
import { PaymentProvider } from '../shared/payment';

export interface CreateCheckoutRequest {
  priceId?: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
  redirectUrl?: string;
}

export class CheckoutService {
  constructor(
    private readonly paymentProvider: PaymentProvider,
    private readonly frontendUrl: string
  ) {}

  async createSession(request: CreateCheckoutRequest): Promise<{ url: string }> {
    const redirectUrl = request.redirectUrl?.replace(/\/$/, '');
    const frontendUrl = this.frontendUrl.replace(/\/$/, '');
    const successUrl = request.successUrl || `${redirectUrl || frontendUrl}/checkout/success`;
    const cancelUrl = request.cancelUrl || `${redirectUrl || frontendUrl}/checkout/cancel`;

    try {
      return await this.paymentProvider.createCheckoutSession({
        priceId: request.priceId && request.priceId !== 'price_monthly' ? request.priceId : undefined,
        customerEmail: request.customerEmail,
        successUrl,
        cancelUrl,
      });
    } catch (error) {
      console.error('Checkout session creation error:', error);
      throw new ValidationError(error instanceof Error ? error.message : 'Failed to create checkout session');
    }
  }
}
