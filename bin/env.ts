import { z, ZodError } from 'zod';

/**
 * CDK deploy-time environment schema.
 *
 * Validates values used by bin/app.ts and deployment scripts.
 * Non-essential variables keep their existing defaults.
 */
export const cdkEnvSchema = z.object({
  STACK_NAME: z.string().min(1, 'STACK_NAME is required'),
  AWS_ACCOUNT_ID: z.string().min(1, 'AWS_ACCOUNT_ID is required'),
  AWS_REGION: z.string().min(1, 'AWS_REGION is required'),
  STRIPE_PARTNER_BUS_NAME: z.string().min(1, 'STRIPE_PARTNER_BUS_NAME is required for Stripe integration').optional(),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required for frontend deployment').optional(),
  IS_TEST: z
    .union([z.enum(['true', 'false']), z.boolean()])
    .optional()
    .transform((value) => (value === 'true' || value === true ? true : false))
    .default(false),
});

export type CdkEnv = z.infer<typeof cdkEnvSchema>;

function formatZodError(error: ZodError): string {
  const summary = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  return `Environment validation failed: ${summary}`;
}

export function validateCdkEnv(input: unknown): CdkEnv {
  const result = cdkEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}
