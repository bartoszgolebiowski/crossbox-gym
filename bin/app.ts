import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import { CrossboxApiStack } from '../lib/stacks/api-stack';
import { CrossboxDataStack } from '../lib/stacks/data-stack';
import { CrossboxFrontendStack } from '../lib/stacks/frontend-stack';

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

const rawStackName = app.node.tryGetContext('stackName') || 
                   (app.node.tryGetContext('stackPrefix') ? `${app.node.tryGetContext('stackPrefix')}Stack` : null) || 
                   process.env.STACK_NAME || 
                   'CrossboxGymDevStack';

const prefix = rawStackName.replace(/Stack$/, '');
const isTest = app.node.tryGetContext('isTestEnvironment') === 'true' || process.env.IS_TEST === 'true';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'eu-central-1',
};

// 1. Data Stack (Tables, Cognito, SQS)
const dataStack = new CrossboxDataStack(app, `${prefix}DataStack`, {
  isTest,
  env,
});

// 2. API Stack (API Gateway, Lambdas, EventBridge)
const apiStack = new CrossboxApiStack(app, `${prefix}ApiStack`, {
  isTest,
  dataStack,
  env,
});

// 3. Frontend Stack (S3 Buckets, CloudFront, Deployments)
new CrossboxFrontendStack(app, `${prefix}FrontendStack`, {
  isTest,
  dataStack,
  apiStack,
  env,
});
