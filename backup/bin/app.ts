import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import { CrossboxGymBackupStack } from '../lib/backup-stack';
import { validateBackupCdkEnv } from './env';

if (fs.existsSync('.env')) {
  try {
    if (typeof (process as any).loadEnvFile === 'function') {
      (process as any).loadEnvFile('.env');
    } else {
      const lines = fs.readFileSync('.env', 'utf8').split(/\r?\n/);
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
    // Ignore .env parsing errors
  }
}

const app = new cdk.App();
const env = validateBackupCdkEnv(process.env);

// Fixed stack name: this is a singleton per account/region, independent of the main app's dev/prod prefixes.
new CrossboxGymBackupStack(app, 'CrossboxGymBackupStack', {
  retentionDays: env.BACKUP_RETENTION_DAYS,
  schedule: env.BACKUP_SCHEDULE,
  env: {
    account: env.AWS_ACCOUNT_ID,
    region: env.AWS_REGION,
  },
});
