#!/usr/bin/env node

import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { validateEnv } from './lib/env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse .env if present
if (fs.existsSync('.env')) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('.env');
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
  } catch {
    // Continue with the existing environment when the optional .env file cannot be read.
  }
}

const pushStripeSecretEnvSchema = z.object({
  AWS_REGION: z.string().min(1, 'AWS_REGION is required'),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
});

const env = validateEnv(pushStripeSecretEnvSchema, process.env);

// Load the SSM parameter path from the shared config.
const ssmPathsPath = path.join(rootDir, 'lib', 'config', 'ssm-paths.json');
const ssmPaths = JSON.parse(fs.readFileSync(ssmPathsPath, 'utf8'));
const parameterName = ssmPaths.stripe?.secretKey;
if (!parameterName) {
  throw new Error('Missing stripe.secretKey in lib/config/ssm-paths.json');
}

const client = new SSMClient({ region: env.AWS_REGION });

async function main() {
  console.log(`\n🔐 Pushing Stripe secret key to SSM Parameter Store...`);
  console.log(`📌 Region         : ${env.AWS_REGION}`);
  console.log(`📌 Parameter Name : ${parameterName}\n`);

  await client.send(
    new PutParameterCommand({
      Name: parameterName,
      Value: env.STRIPE_SECRET_KEY,
      Type: 'SecureString',
      Overwrite: true,
      Description: 'Stripe secret key for CrossBox Gym',
    })
  );

  console.log(`✅ Stripe secret key stored securely at ${parameterName}\n`);
}

main().catch((err) => {
  console.error(`❌ Error pushing Stripe secret key:`, err.message || err);
  process.exit(1);
});
