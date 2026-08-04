import { WebhookContext } from '../context';

/**
 * Handles the invoice.paid Stripe event.
 * Persists invoice metadata and tax details into DynamoDB for user history and tax reporting.
 */
export async function handleInvoicePaid(invoice: any, ctx: WebhookContext): Promise<void> {
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) {
    return;
  }

  const subItem = await ctx.billingRepository.findSubscriptionByStripeId(subscriptionId);
  if (!subItem) {
    return;
  }

  const nowIso = new Date().toISOString();
  const paidAt = invoice.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
    : nowIso;

  await ctx.billingRepository.storeInvoice({
    userId: subItem.PK.replace('USER#', ''),
    invoiceId: invoice.id,
    invoiceNumber: invoice.number || null,
    pdfUrl: invoice.invoice_pdf || null,
    total: invoice.total,
    taxAmount: invoice.tax || invoice.amount_tax || 0,
    currency: invoice.currency,
    status: invoice.status,
    createdAt: nowIso,
    paidAt,
  });
}
