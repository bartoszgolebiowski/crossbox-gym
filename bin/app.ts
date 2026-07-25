import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import { CrossboxGymStack } from '../lib/crossbox-gym-stack';

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
            process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
          }
        }
      }
    }
  } catch (e) {
    // Ignore .env parsing errors
  }
}

const app = new cdk.App();
const stackName = app.node.tryGetContext('stackName') || 
                  (app.node.tryGetContext('stackPrefix') ? `${app.node.tryGetContext('stackPrefix')}Stack` : null) || 
                  process.env.STACK_NAME || 
                  'CrossboxGymStack';

const isTest = app.node.tryGetContext('isTestEnvironment') === 'true';

new CrossboxGymStack(app, stackName, { 
  isTest,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'eu-central-1',
  }
});
