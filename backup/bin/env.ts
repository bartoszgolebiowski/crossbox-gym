import { z, ZodError } from 'zod';

/** CDK deploy-time environment schema for the backup app (independent of the main app). */
export const backupCdkEnvSchema = z.object({
  AWS_ACCOUNT_ID: z.string().min(1, 'AWS_ACCOUNT_ID is required'),
  AWS_REGION: z.string().min(1, 'AWS_REGION is required'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  BACKUP_SCHEDULE: z.string().default('cron(0 2 * * ? *)'),
});

export type BackupCdkEnv = z.infer<typeof backupCdkEnvSchema>;

function formatZodError(error: ZodError): string {
  const summary = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  return `Environment validation failed: ${summary}`;
}

export function validateBackupCdkEnv(input: unknown): BackupCdkEnv {
  const result = backupCdkEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}
