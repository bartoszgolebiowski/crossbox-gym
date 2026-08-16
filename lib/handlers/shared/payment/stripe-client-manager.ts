import Stripe from 'stripe';

export interface StripeClientEnvironment {
  STRIPE_SECRET_KEY?: string;
}

let stripeClient: Stripe | null = null;

export async function getStripeClient(lambdaEnv?: StripeClientEnvironment): Promise<Stripe> {
  if (stripeClient) return stripeClient;

  const resolvedEnv = lambdaEnv ?? process.env;

  if (resolvedEnv.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(resolvedEnv.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' as any });
    return stripeClient;
  }

  throw new Error('Could not retrieve Stripe secret key: STRIPE_SECRET_KEY environment variable is not set');
}
