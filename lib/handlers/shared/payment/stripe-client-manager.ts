import Stripe from 'stripe';
import { SsmStripeSecretKeyProvider } from '../ssm/value-provider';

export interface StripeClientEnvironment {
  STRIPE_SECRET_KEY?: string;
}

let stripeClient: Stripe | null = null;
const stripeSecretKeyProvider = new SsmStripeSecretKeyProvider();

export async function getStripeClient(lambdaEnv?: StripeClientEnvironment): Promise<Stripe> {
  if (stripeClient) return stripeClient;

  const resolvedEnv = lambdaEnv ?? process.env;

  if (resolvedEnv.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(resolvedEnv.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' as any });
    return stripeClient;
  }

  try {
    const key = await stripeSecretKeyProvider.get();
    stripeClient = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    return stripeClient;
  } catch (e) {
    // SSM parameter does not exist in dev/test stack
  }

  throw new Error('Could not retrieve Stripe secret key');
}
