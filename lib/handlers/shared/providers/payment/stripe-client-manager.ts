import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { getStripeSecretKeySsmPath, getStripeWebhookSecretSsmPath } from '../../config';

let stripeClient: Stripe | null = null;
let webhookSecret: string | null = null;
const ssm = new SSMClient({});

/**
 * Lazily initializes and caches a Stripe client instance.
 * Resolves the API key from environment variables first, then falls back to SSM Parameter Store.
 */
export async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) return stripeClient;

  const directKey = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (directKey) {
    stripeClient = new Stripe(directKey, { apiVersion: '2026-06-24.dahlia' as any });
    return stripeClient;
  }

  try {
    const ssmPath = getStripeSecretKeySsmPath();
    const res = await ssm.send(new GetParameterCommand({ Name: ssmPath, WithDecryption: true }));
    const key = res.Parameter?.Value;
    if (key) {
      stripeClient = new Stripe(key, { apiVersion: '2026-06-24.dahlia' as any });
      return stripeClient;
    }
  } catch (e) {
    // SSM parameter does not exist in dev/test stack
  }

  throw new Error('Could not retrieve Stripe secret key');
}

/**
 * Lazily initializes and caches the Stripe webhook signing secret from SSM Parameter Store.
 */
export async function getWebhookSecret(): Promise<string> {
  if (webhookSecret) return webhookSecret;
  const ssmPath = getStripeWebhookSecretSsmPath();
  const res = await ssm.send(new GetParameterCommand({ Name: ssmPath, WithDecryption: true }));
  const secret = res.Parameter?.Value;
  if (!secret) throw new Error('Could not retrieve Stripe webhook secret');
  webhookSecret = secret;
  return webhookSecret;
}
