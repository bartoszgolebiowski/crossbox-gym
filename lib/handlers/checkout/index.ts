import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHandler, parseJsonBody, NotFoundError } from '../shared/http';
import { createPaymentProvider } from '../shared/providers';
import { getFrontendUrl, getPaymentProvider } from '../shared/env';

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'POST' && path === '/checkout/session') {
    const { priceId, customerEmail } = parseJsonBody(event);
    
    const paymentProvider = createPaymentProvider(getPaymentProvider());
    const frontendUrl = getFrontendUrl();
    
    const session = await paymentProvider.createCheckoutSession({
      priceId,
      customerEmail,
      successUrl: `${frontendUrl}/checkout/success`,
      cancelUrl: `${frontendUrl}/checkout/cancel`
    });

    return { url: session.url };
  }

  throw new NotFoundError(`Route ${method} ${path} not found`);
});
