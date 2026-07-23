import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHandler, parseJsonBody, NotFoundError } from '../shared/http';
import { createPaymentProvider } from '../shared/providers';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'POST' && path === '/checkout/session') {
    const { priceId, customerEmail } = parseJsonBody(event);
    
    const paymentProvider = createPaymentProvider(process.env.PAYMENT_PROVIDER || 'mock');
    
    const session = await paymentProvider.createCheckoutSession({
      priceId,
      customerEmail,
      successUrl: `${FRONTEND_URL}/checkout/success`,
      cancelUrl: `${FRONTEND_URL}/checkout/cancel`
    });

    return { url: session.url };
  }

  throw new NotFoundError(`Route ${method} ${path} not found`);
});
