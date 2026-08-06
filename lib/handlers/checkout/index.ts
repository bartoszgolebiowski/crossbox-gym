import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHandler } from '../shared/http';
import { createPaymentProvider } from '../shared/payment';
import { loadCheckoutEnvironment } from './environment';
import { createCheckoutRouter } from './router';
import { CheckoutService } from './service';

export const handler = async (event: APIGatewayProxyEventV2) => {
  const environment = loadCheckoutEnvironment();
  const paymentProvider = createPaymentProvider(environment.paymentProvider);
  const service = new CheckoutService(paymentProvider, environment.frontendUrl);
  return withHandler(createCheckoutRouter(service))(event);
};
