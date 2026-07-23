#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CrossboxGymStack } from '../lib/crossbox-gym-stack';

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
