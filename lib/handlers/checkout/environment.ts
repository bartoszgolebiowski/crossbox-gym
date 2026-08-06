import { z } from 'zod';

export interface CheckoutEnvironment {
  paymentProvider: string;
  frontendUrl: string;
}

const checkoutEnvironmentSchema = z.object({
  PAYMENT_PROVIDER: z.string().min(1, 'PAYMENT_PROVIDER is required'),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),
});

export function loadCheckoutEnvironment(env: NodeJS.ProcessEnv = process.env): CheckoutEnvironment {
  const validated = checkoutEnvironmentSchema.parse(env);
  return {
    paymentProvider: validated.PAYMENT_PROVIDER,
    frontendUrl: validated.FRONTEND_URL,
  };
}
