import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHandler, parseJsonBody, ValidationError, NotFoundError } from '../shared/http';
import { createPaymentProvider } from '../shared/providers';
import { getPaymentProvider } from '../shared/config';

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'POST' && path === '/checkout/session') {
    const body = parseJsonBody(event);
    const query = event.queryStringParameters || {};

    // Prioritize query string parameters as explicitly requested
    const priceId = query.priceId || query.price_id || body.priceId || body.price_id;
    const customerEmail = query.customerEmail || query.customer_email || body.customerEmail || body.customer_email;
    
    const successUrlParam = query.successUrl || query.success_url || body.successUrl || body.success_url;
    const cancelUrlParam = query.cancelUrl || query.cancel_url || body.cancelUrl || body.cancel_url;
    const redirectUrlParam = query.redirectUrl || query.redirect_url || query.returnUrl || query.return_url || body.redirectUrl || body.redirect_url || body.returnUrl || body.return_url;

    const paymentProvider = createPaymentProvider(getPaymentProvider());
    const frontendUrl = process.env.FRONTEND_URL || '';

    // Determine success and cancel URLs directly from query string parameters
    let successUrl = successUrlParam;
    let cancelUrl = cancelUrlParam;

    if (!successUrl) {
      if (redirectUrlParam) {
        successUrl = `${redirectUrlParam.replace(/\/$/, '')}/checkout/success`;
      } else if (frontendUrl) {
        successUrl = `${frontendUrl.replace(/\/$/, '')}/checkout/success`;
      } else {
        successUrl = 'http://localhost:5173/checkout/success';
      }
    }

    if (!cancelUrl) {
      if (redirectUrlParam) {
        cancelUrl = `${redirectUrlParam.replace(/\/$/, '')}/checkout/cancel`;
      } else if (frontendUrl) {
        cancelUrl = `${frontendUrl.replace(/\/$/, '')}/checkout/cancel`;
      } else {
        cancelUrl = 'http://localhost:5173/checkout/cancel';
      }
    }

    try {
      const session = await paymentProvider.createCheckoutSession({
        priceId: (priceId && priceId !== 'price_monthly') ? priceId : undefined,
        customerEmail,
        successUrl,
        cancelUrl
      });

      return { url: session.url };
    } catch (err: any) {
      console.error('Checkout session creation error:', err);
      throw new ValidationError(err.message || 'Failed to create Stripe Checkout session');
    }
  }

  throw new NotFoundError(`Route ${method} ${path} not found`);
});
