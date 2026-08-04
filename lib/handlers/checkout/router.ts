import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { NotFoundError, parseJsonBody } from '../shared/http';
import { CheckoutService } from './service';

export function createCheckoutRouter(service: CheckoutService) {
  return async (event: APIGatewayProxyEventV2) => {
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;
    if (method !== 'POST' || path !== '/checkout/session') {
      throw new NotFoundError(`Route ${method} ${path} not found`);
    }

    const body = parseJsonBody(event);
    const query = event.queryStringParameters || {};
    return service.createSession({
      priceId: query.priceId || query.price_id || body.priceId || body.price_id,
      customerEmail: query.customerEmail || query.customer_email || body.customerEmail || body.customer_email,
      successUrl: query.successUrl || query.success_url || body.successUrl || body.success_url,
      cancelUrl: query.cancelUrl || query.cancel_url || body.cancelUrl || body.cancel_url,
      redirectUrl:
        query.redirectUrl ||
        query.redirect_url ||
        query.returnUrl ||
        query.return_url ||
        body.redirectUrl ||
        body.redirect_url ||
        body.returnUrl ||
        body.return_url,
    });
  };
}
