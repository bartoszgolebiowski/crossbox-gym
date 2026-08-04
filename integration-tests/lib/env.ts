import { z, ZodError } from 'zod';

export const integrationTestEnvSchema = z.object({
  STACK_NAME: z.string().default('CrossboxGymDev'),
  AWS_REGION: z.string().default('eu-central-1'),
  ADMIN_EMAIL: z.string().default('admin@crossboxgym.com'),
  ADMIN_PASSWORD: z.string().default('Admin123!'),
});

export type IntegrationTestEnv = z.infer<typeof integrationTestEnvSchema>;

function formatZodError(error: ZodError): string {
  const summary = error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  return `Environment validation failed: ${summary}`;
}

export function validateIntegrationTestEnv(input: unknown): IntegrationTestEnv {
  const result = integrationTestEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

export function resolveIntegrationTestEnv(): IntegrationTestEnv {
  return validateIntegrationTestEnv({
    ...process.env,
    STACK_NAME: argValue('--stack') ?? process.env.STACK_NAME,
    AWS_REGION: argValue('--region') ?? process.env.AWS_REGION,
  });
}
