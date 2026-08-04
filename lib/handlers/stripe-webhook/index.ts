import { createWebhookContext } from './context';
import { handleCheckoutSessionCompleted } from './events/checkout-session-completed';
import { handleInvoicePaid } from './events/invoice-paid';
import { handleInvoicePaymentFailed } from './events/invoice-payment-failed';
import { handleSubscriptionUpdated } from './events/subscription-updated';

export const handler = async (event: any): Promise<any> => {
  const ctx = createWebhookContext();

  // Extract event payload from EventBridge envelope (event.detail), API Gateway body, or direct invocation
  let stripeEvent = event;
  if (event.detail && typeof event.detail === 'object') {
    stripeEvent = event.detail;
  }

  const eventType = stripeEvent.type || event['detail-type'];

  switch (eventType) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(stripeEvent.data.object, ctx);
      break;

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionUpdated(stripeEvent.data.object, eventType, ctx);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(stripeEvent.data.object, ctx);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(stripeEvent.data.object, ctx);
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  return { received: true };
};
