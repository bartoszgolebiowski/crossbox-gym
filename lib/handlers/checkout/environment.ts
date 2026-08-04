import { LambdaEnv, validateLambdaEnv } from '../shared/config';

export interface CheckoutEnvironment {
  paymentProvider: string;
  frontendUrl: string;
}

export function loadCheckoutEnvironment(env: NodeJS.ProcessEnv = process.env): CheckoutEnvironment {
  const validated = validateLambdaEnv(env) as LambdaEnv;
  return {
    paymentProvider: validated.PAYMENT_PROVIDER,
    frontendUrl: validated.FRONTEND_URL,
  };
}
