import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHandler } from '../shared/http';
import { createPaymentProvider } from '../shared/providers';
import { loadCheckoutEnvironment } from './environment';
import { createCheckoutRouter } from './router';
import { CheckoutService } from './service';

export const handler = async (event: APIGatewayProxyEventV2) => {
  const environment = loadCheckoutEnvironment();
  const service = new CheckoutService(createPaymentProvider(environment.paymentProvider), environment.frontendUrl);
  return withHandler(createCheckoutRouter(service))(event);
};
