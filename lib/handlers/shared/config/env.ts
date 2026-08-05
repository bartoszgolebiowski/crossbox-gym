import { ZodError } from 'zod';
import { LambdaEnv, lambdaEnvSchema } from './schema';

export type { LambdaEnv };

function formatZodError(error: ZodError): string {
  const summary = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  return `Environment validation failed: ${summary}`;
}

/**
 * Validate a process-env-like object against the Lambda runtime schema.
 * Throws a clear, aggregated error if required variables are missing.
 */
export function validateLambdaEnv(input: unknown): LambdaEnv {
  const result = lambdaEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}
