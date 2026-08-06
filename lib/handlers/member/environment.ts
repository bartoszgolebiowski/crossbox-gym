import { z } from 'zod';

export interface MemberEnvironment {
  mainTableName: string;
  paymentProvider: string;
  frontendUrl: string;
}

const memberEnvironmentSchema = z.object({
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
  PAYMENT_PROVIDER: z.string().min(1, 'PAYMENT_PROVIDER is required'),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),
});

export function loadMemberEnvironment(env: NodeJS.ProcessEnv = process.env): MemberEnvironment {
  const validated = memberEnvironmentSchema.parse(env);
  return {
    mainTableName: validated.MAIN_TABLE_NAME,
    paymentProvider: validated.PAYMENT_PROVIDER,
    frontendUrl: validated.FRONTEND_URL,
  };
}
