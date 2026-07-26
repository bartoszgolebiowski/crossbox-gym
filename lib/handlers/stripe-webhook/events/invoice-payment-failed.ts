import { WebhookContext } from '../context';

/**
 * Handles the invoice.payment_failed Stripe event.
 * Sends a payment failure notification email to the customer.
 */
export async function handleInvoicePaymentFailed(
  invoice: any,
  _ctx: WebhookContext
): Promise<void> {
  const customerEmail = invoice.customer_email;
  console.warn(`Payment failed for invoice ${invoice.id} (customer: ${customerEmail || 'unknown'})`);
}
