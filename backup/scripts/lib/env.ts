import * as fs from 'fs';
import * as path from 'path';
import { z, ZodError } from 'zod';

export const backupScriptsEnvSchema = z.object({
  AWS_REGION: z.string().min(1, 'AWS_REGION is required'),
  STACK_NAME: z.string().default('CrossboxGymBackupStack'),
});

export type BackupScriptsEnv = z.infer<typeof backupScriptsEnvSchema>;

function loadEnvIfPresent(): void {
  const envCandidates = ['.env', '../.env'];
  for (const envFile of envCandidates) {
    const fullPath = path.resolve(process.cwd(), envFile);
    if (fs.existsSync(fullPath)) {
      try {
        if (typeof (process as any).loadEnvFile === 'function') {
          (process as any).loadEnvFile(fullPath);
        } else {
          const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const [k, ...v] = trimmed.split('=');
              if (k && !process.env[k.trim()]) {
                process.env[k.trim()] = v
                  .join('=')
                  .trim()
                  .replace(/^["']|["']$/g, '');
              }
            }
          }
        }
      } catch (e) {
        // Ignore .env loading errors
      }
    }
  }
}

function formatZodError(error: ZodError): string {
  const summary = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  return `Environment validation failed: ${summary}`;
}

export function validateBackupScriptsEnv(input: unknown): BackupScriptsEnv {
  loadEnvIfPresent();
  const result = backupScriptsEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

