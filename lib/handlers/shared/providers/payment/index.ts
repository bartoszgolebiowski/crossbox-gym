import { PaymentProvider } from '../types';
import { MockPaymentProvider } from './mock-payment-provider';
import { StripePaymentProvider } from './stripe-payment-provider';

export { MockPaymentProvider } from './mock-payment-provider';
export { StripePaymentProvider } from './stripe-payment-provider';

const paymentProviders: Record<string, new () => PaymentProvider> = {
  stripe: StripePaymentProvider,
  mock: MockPaymentProvider,
};

export function createPaymentProvider(type: string): PaymentProvider {
  const ProviderClass = paymentProviders[type];
  if (!ProviderClass) {
    throw new Error(`Unsupported payment provider type: '${type}'`);
  }
  return new ProviderClass();
}
