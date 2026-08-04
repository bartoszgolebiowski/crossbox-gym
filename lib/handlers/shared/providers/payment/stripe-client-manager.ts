import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { SSM_PATH_STRIPE_SECRET_KEY } from '../../../../config';
import { LambdaEnv, validateLambdaEnv } from '../../config';

let stripeClient: Stripe | null = null;
const ssm = new SSMClient({});

/**
 * Lazily initializes and caches a Stripe client instance.
 * Resolves the API key from the provided env first, then falls back to SSM Parameter Store.
 */
export async function getStripeClient(lambdaEnv?: LambdaEnv): Promise<Stripe> {
  if (stripeClient) return stripeClient;

  const resolvedEnv = lambdaEnv ?? validateLambdaEnv(process.env);

  if (resolvedEnv.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(resolvedEnv.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' as any });
    return stripeClient;
  }

  try {
    const res = await ssm.send(new GetParameterCommand({ Name: SSM_PATH_STRIPE_SECRET_KEY, WithDecryption: true }));
    const key = res.Parameter?.Value;
    if (key) {
      stripeClient = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
      return stripeClient;
    }
  } catch (e) {
    // SSM parameter does not exist in dev/test stack
  }

  throw new Error('Could not retrieve Stripe secret key');
}
