import { z } from 'zod';
import { getDeviceByType } from '../../../config';

/**
 * Shared runtime environment schema for Lambda handlers.
 *
 * Required variables throw a clear Zod error when missing.
 * Optional variables fall back to sensible defaults.
 */
export const lambdaEnvSchema = z.object({
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
  ENTRY_LOGS_TABLE_NAME: z.string().min(1, 'ENTRY_LOGS_TABLE_NAME is required'),
  AUDIT_LOGS_TABLE_NAME: z.string().min(1, 'AUDIT_LOGS_TABLE_NAME is required'),
  USER_POOL_ID: z.string().min(1, 'USER_POOL_ID is required'),
  USER_POOL_CLIENT_ID: z.string().min(1, 'USER_POOL_CLIENT_ID is required'),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_SANDBOX: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === 'true'),

  PAYMENT_PROVIDER: z.string().default('stripe'),
  IDENTITY_PROVIDER: z.string().default('cognito'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  ADMIN_FRONTEND_URL: z.string().default('http://localhost:3001'),

  LOCKER_CLIENT_TYPE: z.string().default('mqtt'),
  LOCKER_THING_NAME: z.string().default(getDeviceByType('locker').thingName),
  IOT_ENDPOINT: z.string().optional(),
});

export type LambdaEnv = z.infer<typeof lambdaEnvSchema>;
