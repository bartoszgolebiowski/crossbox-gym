#!/usr/bin/env node

import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCertsEnvSchema, validateEnv } from './lib/env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const certsDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, 'certs');

// Load the central IoT fleet configuration that drives the IoT stack.
const fleetConfigPath = path.join(rootDir, 'lib', 'config', 'iot-fleet.json');
const fleetConfig = JSON.parse(fs.readFileSync(fleetConfigPath, 'utf8'));

function getFleetDevices() {
  return (fleetConfig.devices || []).map((device) => ({
    id: device.id,
    thingName: device.thingName,
    secretName: fleetConfig.secretName,
    outputNames: device.outputs || {},
  }));
}

function extractDeviceCert(parsed, thingName) {
  // New per-device format: { "thingName": { certificate_pem, ... } }
  if (parsed && typeof parsed === 'object' && parsed[thingName]?.certificate_pem) {
    return parsed[thingName];
  }
  // Legacy flat format: { certificate_pem, ... }
  if (parsed?.certificate_pem) {
    return parsed;
  }
  return null;
}

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

const env = validateEnv(fetchCertsEnvSchema, process.env);
const region = env.AWS_REGION;
const client = new SecretsManagerClient({ region });

async function main() {
  console.log(`\n🔐 Fetching AWS IoT Certificates...`);
  console.log(`📌 Region       : ${region}`);
  console.log(`📁 Target Dir   : ${certsDir}\n`);

  // Known IoT Things are derived from the central fleet config.
  const knownThings = getFleetDevices();

  // Try fetching secret names and overrides from cdk-outputs.json if available.
  const outputsPath = path.join(rootDir, 'cdk-outputs.json');
  if (fs.existsSync(outputsPath)) {
    try {
      const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
      const iotOutputs = Object.entries(outputs).find(([k]) => k.endsWith('IotStack'))?.[1];
      if (iotOutputs) {
        for (const knownThing of knownThings) {
          const thingOutputName = knownThing.outputNames.thingName;
          if (thingOutputName && iotOutputs[thingOutputName]) {
            knownThing.thingName = iotOutputs[thingOutputName];
          }
        }
        if (iotOutputs.SecretNameOutput) {
          for (const knownThing of knownThings) {
            knownThing.secretName = iotOutputs.SecretNameOutput;
          }
        }
      }
    } catch {
      // Continue with the configured certificate defaults when cached outputs are unavailable.
    }
  }

    // Allow environment override of the IoT certificate secret name (used by integration tests).
  if (env.SECRET_NAME_IOT) {
    for (const knownThing of knownThings) {
      knownThing.secretName = env.SECRET_NAME_IOT;
    }
  }

  // Ensure root certs directory exists
  fs.mkdirSync(certsDir, { recursive: true });

  // Get secrets from Secrets Manager
  let certSecrets = [];
  try {
    const secretsList = await client.send(new ListSecretsCommand({}));
    certSecrets = (secretsList.SecretList || []).filter(
      (s) => s.Name && (s.Name.includes('certs') || s.Name.includes('qr-scanner') || s.Name.includes('crossbox'))
    );
  } catch (e) {
    console.warn(`Could not list secrets from AWS Secrets Manager: ${e.message}`);
  }

  if (certSecrets.length === 0 && knownThings.length > 0) {
    certSecrets.push({ Name: knownThings[0].secretName });
  }

  for (const knownThing of knownThings) {
    const targetDir = path.join(certsDir, knownThing.thingName);
    fs.mkdirSync(targetDir, { recursive: true });

    let secretPayload = null;
    for (const s of certSecrets) {
      try {
        const val = await client.send(new GetSecretValueCommand({ SecretId: s.Name }));
        if (val.SecretString) {
          const parsed = JSON.parse(val.SecretString);
          const deviceCert = extractDeviceCert(parsed, knownThing.thingName);
          if (deviceCert?.certificate_pem && deviceCert?.private_key) {
            secretPayload = deviceCert;
            break;
          }
        }
      } catch (e) {
        // Continue checking other secrets
      }
    }

    if (secretPayload) {
      const certPemPath = path.join(targetDir, 'certificate.pem.crt');
      const privKeyPath = path.join(targetDir, 'private.pem.key');
      const rootCaPath = path.join(targetDir, 'AmazonRootCA1.pem');
      const configPath = path.join(targetDir, 'config.json');

      fs.writeFileSync(certPemPath, secretPayload.certificate_pem);
      fs.writeFileSync(privKeyPath, secretPayload.private_key);
      if (secretPayload.root_ca) {
        fs.writeFileSync(rootCaPath, secretPayload.root_ca);
      }

      const configData = {
        thing_name: knownThing.thingName,
        certificate_arn: secretPayload.certificate_arn || '',
        certificate_id: secretPayload.certificate_id || '',
        endpoint_address: secretPayload.endpoint_address || '',
        updated_at: new Date().toISOString(),
      };
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\n');

      console.log(`✅ Certificates partitioned for '${knownThing.thingName}':`);
      console.log(`   - ${path.relative(rootDir, certPemPath)}`);
      console.log(`   - ${path.relative(rootDir, privKeyPath)}`);
      if (secretPayload.root_ca) console.log(`   - ${path.relative(rootDir, rootCaPath)}`);
      console.log(`   - ${path.relative(rootDir, configPath)}\n`);
    } else {
      console.warn(`⚠️  No certificate secret found for '${knownThing.thingName}' in region ${region}.`);
    }
  }

  console.log(`✨ Certificate download and partitioning complete!\n`);
}

main().catch((err) => {
  console.error(`❌ Error fetching certificates:`, err.message || err);
  process.exit(1);
});
