import Stripe from 'stripe';
import { getStripeClient } from './stripe-client-manager';
import { PaymentProvider, StripeProductPrice } from './types';

export class StripePaymentProvider implements PaymentProvider {
  constructor(private readonly stripeClient?: Stripe) {}

  private async getClient(): Promise<Stripe> {
    if (this.stripeClient) return this.stripeClient;
    return getStripeClient();
  }

  async createCheckoutSession(params: {
    priceId?: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
    enableTax?: boolean;
  }): Promise<{ url: string }> {
    const stripe = await this.getClient();

    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const isExplicitStripePrice =
      params.priceId && params.priceId.startsWith('price_') && params.priceId !== 'price_monthly';

    let billingCycleAnchor: number | undefined;
    let isDistantAnchor = false;
    let retrievedPrice: Stripe.Price | undefined;

    if (isExplicitStripePrice && params.priceId) {
      try {
        retrievedPrice = await stripe.prices.retrieve(params.priceId, {
          expand: ['product'],
        });

        if (retrievedPrice && retrievedPrice.product && typeof retrievedPrice.product !== 'string') {
          const product = retrievedPrice.product as Stripe.Product;
          const rawAnchor = product.metadata?.billing_cycle_anchor;

          if (rawAnchor) {
            const trimmedAnchor = rawAnchor.trim();
            const parsedAnchor = parseInt(trimmedAnchor, 10);
            const nowInSeconds = Math.floor(Date.now() / 1000);

            const maxAnchorOffsetSeconds = 31 * 86400; // 31 days max for direct Stripe billing_cycle_anchor

            if (isNaN(parsedAnchor) || !/^\d+$/.test(trimmedAnchor)) {
              console.warn(
                `[Deferred Anchor] Malformed billing_cycle_anchor metadata '${rawAnchor}' on product ${product.id}. Falling back to standard subscription.`
              );
            } else if (parsedAnchor <= nowInSeconds) {
              console.warn(
                `[Deferred Anchor] Past billing_cycle_anchor timestamp ${parsedAnchor} (current: ${nowInSeconds}) on product ${product.id}. Falling back to standard subscription.`
              );
            } else if (parsedAnchor > nowInSeconds + maxAnchorOffsetSeconds) {
              billingCycleAnchor = parsedAnchor;
              isDistantAnchor = true;
              console.log(
                `[Deferred Anchor] Applied distant presale anchor timestamp ${billingCycleAnchor} (${new Date(
                  billingCycleAnchor * 1000
                ).toISOString()}) via upfront charge + trial_end for product ${product.id}`
              );
            } else {
              billingCycleAnchor = parsedAnchor;
              isDistantAnchor = false;
              console.log(
                `[Deferred Anchor] Applied direct billing_cycle_anchor timestamp ${billingCycleAnchor} (${new Date(
                  billingCycleAnchor * 1000
                ).toISOString()}) for product ${product.id}`
              );
            }
          }

          // Check for optional campaign expiration metadata (e.g. presale_end_date)
          const rawEndDate = product.metadata?.presale_end_date || product.metadata?.available_until;
          if (rawEndDate) {
            const parsedEndDate = parseInt(rawEndDate.trim(), 10);
            const nowInSeconds = Math.floor(Date.now() / 1000);
            if (!isNaN(parsedEndDate) && parsedEndDate <= nowInSeconds) {
              throw new Error('This campaign pass is no longer available for purchase.');
            }
          }
        }
      } catch (err: any) {
        if (err.message?.includes('no longer available')) {
          throw err;
        }
        console.warn(
          `[Deferred Anchor] Could not inspect product metadata for price ${params.priceId}:`,
          err?.message || err
        );
      }
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      line_items: isExplicitStripePrice
        ? [{ price: params.priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: 'pln',
                product_data: {
                  name: 'CrossBox Gym Monthly All-Access Membership',
                  description:
                    'Nieograniczony dostęp do wszystkich lokalizacji CrossBox Gym, klucz do bramki i aplikacja mobilna.',
                },
                recurring: { interval: 'month' },
                unit_amount: 13900,
                tax_behavior: 'exclusive',
              },
              quantity: 1,
            },
          ],
      customer_email: params.customerEmail,
      metadata: {
        integration_check: `checkout_${randomSuffix}`,
        ...(params.metadata || {}),
      },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
    };

    if (billingCycleAnchor && isDistantAnchor && retrievedPrice && params.priceId) {
      const productObj = typeof retrievedPrice.product !== 'string' ? (retrievedPrice.product as Stripe.Product) : null;
      sessionParams.line_items = [
        {
          price_data: {
            currency: retrievedPrice.currency,
            product_data: {
              name: `${productObj?.name || 'Karnet'} (Dostęp Przedsprzedażowy)`,
              description: productObj?.description || 'Dostęp przedsprzedażowy od momentu zakupu do pierwszego odnowienia',
            },
            unit_amount: retrievedPrice.unit_amount || 0,
          },
          quantity: 1,
        },
        { price: params.priceId, quantity: 1 },
      ];
      sessionParams.subscription_data = {
        trial_end: billingCycleAnchor,
      };
    } else if (billingCycleAnchor && !isDistantAnchor) {
      sessionParams.subscription_data = {
        billing_cycle_anchor: billingCycleAnchor,
        proration_behavior: 'none',
      };
    }

    try {
      const session = await stripe.checkout.sessions.create(sessionParams);
      return { url: session.url! };
    } catch (err: any) {
      if (err.message?.includes('billing_cycle_anchor')) {
        console.warn(
          `[Deferred Anchor] Stripe rejected billing_cycle_anchor (${err.message}). Retrying checkout without anchor override.`
        );
        delete sessionParams.subscription_data;
        const session = await stripe.checkout.sessions.create(sessionParams);
        return { url: session.url! };
      }
      if (err.message?.includes('No such price') || err.message?.includes('resource_missing')) {
        sessionParams.line_items = [
          {
            price_data: {
              currency: 'pln',
              product_data: {
                name: 'CrossBox Gym Monthly All-Access Membership',
                description:
                  'Nieograniczony dostęp do wszystkich lokalizacji CrossBox Gym, klucz do bramki i aplikacja mobilna.',
              },
              recurring: { interval: 'month' },
              unit_amount: 13900,
              tax_behavior: 'exclusive',
            },
            quantity: 1,
          },
        ];
        const session = await stripe.checkout.sessions.create(sessionParams);
        return { url: session.url! };
      }
      if (
        err.message?.includes('tax') ||
        err.message?.includes('head office address') ||
        err.message?.includes('automatic_tax')
      ) {
        delete sessionParams.automatic_tax;
        const session = await stripe.checkout.sessions.create(sessionParams);
        return { url: session.url! };
      }
      throw err;
    }
  }

  async createPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    const stripe = await this.getClient();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
      });
      return { url: session.url };
    } catch (err: any) {
      if (
        err.message?.includes('No such customer') ||
        err.message?.includes('resource_missing') ||
        err.code === 'resource_missing'
      ) {
        return { url: `${params.returnUrl}?portal_mock=true` };
      }
      throw err;
    }
  }

  async listInvoices(params: { customerId: string }): Promise<
    Array<{
      id: string;
      number: string | null;
      pdfUrl: string | null;
      total: number;
      tax: number;
      currency: string;
      status: string | null;
      createdAt: string;
    }>
  > {
    const stripe = await this.getClient();
    const invoices = await stripe.invoices.list({
      customer: params.customerId,
      limit: 24,
    });

    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      pdfUrl: inv.invoice_pdf || null,
      total: inv.total,
      tax: (inv as any).tax || (inv as any).amount_tax || 0,
      currency: inv.currency,
      status: inv.status,
      createdAt: new Date(inv.created * 1000).toISOString(),
    }));
  }

  async listProducts(): Promise<StripeProductPrice[]> {
    const stripe = await getStripeClient();
    try {
      const prices = await stripe.prices.list({
        active: true,
        expand: ['data.product'],
        limit: 50,
      });

      return prices.data
        .filter((price) => {
          if (!price.active) return false;
          if (!price.product || typeof price.product === 'string') return false;
          const product = price.product as Stripe.Product;
          if (product.active === false) return false;

          const rawEndDate = product.metadata?.presale_end_date || product.metadata?.available_until;
          if (rawEndDate) {
            const parsedEndDate = parseInt(rawEndDate.trim(), 10);
            const nowInSeconds = Math.floor(Date.now() / 1000);
            if (!isNaN(parsedEndDate) && parsedEndDate <= nowInSeconds) {
              return false; // Presale campaign has ended, hide product
            }
          }

          return true;
        })
        .map((price) => {
          const product = price.product as Stripe.Product;
          return {
            id: price.id,
            productId: product.id,
            name: product.name,
            description: product.description || null,
            unitAmount: price.unit_amount || 0,
            currency: price.currency,
            interval: price.recurring?.interval || null,
            metadata: product.metadata || {},
          };
        });
    } catch (err) {
      console.error('Error fetching Stripe products:', err);
      return [];
    }
  }
}
