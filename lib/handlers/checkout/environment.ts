export interface CheckoutEnvironment {
  paymentProvider: string;
  frontendUrl: string;
}

export function loadCheckoutEnvironment(environment: NodeJS.ProcessEnv = process.env): CheckoutEnvironment {
  return {
    paymentProvider: environment.PAYMENT_PROVIDER?.trim() || 'stripe',
    frontendUrl: environment.FRONTEND_URL?.trim() || 'http://localhost:5173',
  };
}
