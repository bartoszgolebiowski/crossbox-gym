#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrationTestEnvSchema, validateEnv } from './lib/env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputsPath = path.join(rootDir, 'cdk-outputs.json');
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {}
}

function run(command, args) {
  execFileSync(command, args, { cwd: rootDir, stdio: 'inherit' });
}

function getFrontendOutputs() {
  let frontend;
  if (fs.existsSync(outputsPath)) {
    try {
      const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
      frontend = Object.entries(outputs).find(([stackName]) => stackName.endsWith('FrontendStack'))?.[1];
    } catch {
      // Fall back to CloudFormation when the local output cache is unavailable.
    }
  }

  if (!frontend || typeof frontend !== 'object') {
    try {
      const env = validateEnv(integrationTestEnvSchema, process.env);
      const region = env.AWS_REGION;
      const stackName = (env.STACK_NAME ? env.STACK_NAME.replace(/Stack$/, '') : 'CrossboxGymDev') + 'FrontendStack';
      const outputJson = execFileSync(
        'aws',
        ['cloudformation', 'describe-stacks', '--stack-name', stackName, '--region', region, '--output', 'json'],
        { encoding: 'utf8' }
      );
      const parsed = JSON.parse(outputJson);
      const outputs = parsed.Stacks?.[0]?.Outputs || [];
      frontend = {};
      for (const o of outputs) {
        if (o.OutputKey && o.OutputValue) {
          frontend[o.OutputKey] = o.OutputValue;
        }
      }
    } catch (e) {
      throw new Error('Frontend stack outputs are missing. Deploy the frontend stack before publishing UI assets.');
    }
  }

  const required = [
    'ApiUrl',
    'UserPoolId',
    'UserPoolClientId',
    'AppBucketName',
    'AdminBucketName',
    'HeroBucketName',
    'AppDistributionId',
    'AdminDistributionId',
    'HeroDistributionId',
    'AppUrl',
  ];
  for (const key of required) {
    if (typeof frontend[key] !== 'string' || !frontend[key]) {
      throw new Error(`Frontend stack output ${key} is missing. Run npm run deploy -- -s frontend first.`);
    }
  }

  new URL(frontend.ApiUrl);
  return frontend;
}

function writeRuntimeConfig(distDir, config) {
  fs.writeFileSync(path.join(distDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
}

console.log('\nPublishing Crossbox Gym UI assets...');
run(process.execPath, ['scripts/build-ui.mjs']);

const frontend = getFrontendOutputs();
const config = {
  ApiUrl: frontend.ApiUrl.replace(/\/+$/, ''),
  UserPoolId: frontend.UserPoolId,
  UserPoolClientId: frontend.UserPoolClientId,
};
const gaMeasurementId =
  frontend.GaMeasurementId ||
  (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend', 'hero', 'public', 'config.json'), 'utf8'))
        .GaMeasurementId;
    } catch {
      return undefined;
    }
  })();
const heroConfig = {
  ...config,
  MemberAppUrl: frontend.AppUrl.replace(/\/+$/, ''),
  ...(gaMeasurementId ? { GaMeasurementId: gaMeasurementId } : {}),
};

const appDist = path.join(rootDir, 'frontend', 'app', 'dist');
const adminDist = path.join(rootDir, 'frontend', 'admin', 'dist');
const heroDist = path.join(rootDir, 'frontend', 'hero', 'dist');
writeRuntimeConfig(appDist, config);
writeRuntimeConfig(adminDist, config);
writeRuntimeConfig(heroDist, heroConfig);

run('aws', ['s3', 'sync', appDist, `s3://${frontend.AppBucketName}`, '--delete']);
run('aws', ['s3', 'sync', adminDist, `s3://${frontend.AdminBucketName}`, '--delete']);
run('aws', ['s3', 'sync', heroDist, `s3://${frontend.HeroBucketName}`, '--delete']);
run('aws', ['cloudfront', 'create-invalidation', '--distribution-id', frontend.AppDistributionId, '--paths', '/*']);
run('aws', ['cloudfront', 'create-invalidation', '--distribution-id', frontend.AdminDistributionId, '--paths', '/*']);
run('aws', ['cloudfront', 'create-invalidation', '--distribution-id', frontend.HeroDistributionId, '--paths', '/*']);

console.log('\nUI assets and runtime configuration published successfully.');
