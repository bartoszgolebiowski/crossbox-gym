import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import { CrossboxApiStack } from '../lib/stacks/api-stack';
import { CrossboxDataStack } from '../lib/stacks/data-stack';
import { CrossboxFrontendStack } from '../lib/stacks/frontend-stack';
import { CrossboxIotStack } from '../lib/stacks/iot-stack';
import { validateCdkEnv } from './env';

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

const validatedEnv = validateCdkEnv(process.env);

const rawStackName =
  app.node.tryGetContext('stackName') ||
  (app.node.tryGetContext('stackPrefix') ? `${app.node.tryGetContext('stackPrefix')}Stack` : null) ||
  validatedEnv.STACK_NAME ||
  'CrossboxGymDevStack';

const prefix = rawStackName.replace(/Stack$/, '');
const isTest = app.node.tryGetContext('isTestEnvironment') === 'true' || validatedEnv.IS_TEST;

const env = {
  account: validatedEnv.AWS_ACCOUNT_ID,
  region: validatedEnv.AWS_REGION,
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
  appDistributionDomainName:
    app.node.tryGetContext('appDistributionDomainName') ||
    process.env.FRONTEND_URL?.replace(/^https?:\/\//, '') ||
    'd24myygtjwitnk.cloudfront.net',
  partnerBusName: app.node.tryGetContext('stripePartnerBusName') || validatedEnv.STRIPE_PARTNER_BUS_NAME,
  env,
});

// 3. Frontend Stack (S3 Buckets, CloudFront, Deployments)
new CrossboxFrontendStack(app, `${prefix}FrontendStack`, {
  isTest,
  dataStack,
  apiStack,
  gaMeasurementId: validatedEnv.GA_MEASUREMENT_ID,
  env,
});

// 4. IoT Stack (IoT Core Thing, Policy, mTLS Cert Secret, Topic Rule)
new CrossboxIotStack(app, `${prefix}IotStack`, {
  isTest,
  apiStack,
  env,
});
