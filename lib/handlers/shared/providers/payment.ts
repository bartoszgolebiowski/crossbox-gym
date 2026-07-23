import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { PaymentProvider } from './types';

let stripeClient: Stripe | null = null;
let webhookSecret: string | null = null;
const ssm = new SSMClient({});

async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) return stripeClient;
  const path = process.env.STRIPE_SECRET_KEY_SSM_PATH;
  if (!path) throw new Error('STRIPE_SECRET_KEY_SSM_PATH env var not set');
  const res = await ssm.send(new GetParameterCommand({ Name: path, WithDecryption: true }));
  const key = res.Parameter?.Value;
  if (!key) throw new Error('Could not retrieve Stripe secret key');
  stripeClient = new Stripe(key, { apiVersion: '2024-06-20' as any });
  return stripeClient;
}

async function getWebhookSecret(): Promise<string> {
  if (webhookSecret) return webhookSecret;
  const path = process.env.STRIPE_WEBHOOK_SECRET_SSM_PATH;
  if (!path) throw new Error('STRIPE_WEBHOOK_SECRET_SSM_PATH env var not set');
  const res = await ssm.send(new GetParameterCommand({ Name: path, WithDecryption: true }));
  const secret = res.Parameter?.Value;
  if (!secret) throw new Error('Could not retrieve Stripe webhook secret');
  webhookSecret = secret;
  return webhookSecret;
}

export class StripePaymentProvider implements PaymentProvider {
  async createCheckoutSession(params: { priceId?: string; successUrl: string; cancelUrl: string; customerEmail?: string; metadata?: Record<string, string>; }): Promise<{ url: string; }> {
    const stripe = await getStripeClient();
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      line_items: params.priceId ? [{ price: params.priceId, quantity: 1 }] : undefined,
      customer_email: params.customerEmail,
      metadata: params.metadata,
    };
    const session = await stripe.checkout.sessions.create(sessionParams);
    if (!session.url) throw new Error('No session URL returned from Stripe');
    return { url: session.url };
  }

  async createPortalSession(params: { customerId: string; returnUrl: string; }): Promise<{ url: string; }> {
    const stripe = await getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  async constructWebhookEvent(payload: string, signature: string): Promise<any> {
    const stripe = await getStripeClient();
    const secret = await getWebhookSecret();
    return stripe.webhooks.constructEvent(payload, signature, secret);
  }
}

export class MockPaymentProvider implements PaymentProvider {
  async createCheckoutSession(params: any): Promise<{ url: string }> {
    return { url: 'https://mock.stripe.com/checkout' };
  }
  
  async createPortalSession(params: any): Promise<{ url: string }> {
    return { url: 'https://mock.stripe.com/portal' };
  }
  
  async constructWebhookEvent(payload: string, signature: string): Promise<any> {
    // Basic mock parser
    return JSON.parse(payload);
  }
}

export function createPaymentProvider(type: string): PaymentProvider {
  return type === 'mock' ? new MockPaymentProvider() : new StripePaymentProvider();
}
