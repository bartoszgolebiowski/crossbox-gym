#!/usr/bin/env node

/**
 * Provision scanner and locker devices directly into DynamoDB.
 *
 * Usage:
 *   node scripts/provision-devices.mjs <locationId>
 *
 * The script reads stack outputs from cdk-outputs.json, creates a locker
 * device record (DEV#) and a scanner record (SCANNER#) under the given
 * location, and prints the generated scanner API key once.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { validateEnv } from './lib/env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const provisionDevicesEnvSchema = z.object({
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
});

function readOutputs() {
  const outputsPath = path.join(rootDir, 'cdk-outputs.json');
  try {
    if (fs.existsSync(outputsPath)) {
      const data = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
      let merged = {};
      for (const stackKey of Object.keys(data)) {
        merged = { ...merged, ...data[stackKey] };
      }
      return merged;
    }
  } catch {
    // fall through
  }
  return {};
}

function readFleetConfig() {
  const fleetPath = path.join(rootDir, 'lib', 'config', 'iot-fleet.json');
  const text = fs.readFileSync(fleetPath, 'utf8');
  return JSON.parse(text);
}

function getDeviceByType(type) {
  const fleet = readFleetConfig();
  const device = fleet.devices.find((d) => d.type === type);
  if (!device) {
    throw new Error(`No IoT fleet device configured for type: ${type}`);
  }
  return device;
}

function formatDeviceTopic(template, thingName) {
  return template.replace(/\{thingName\}/g, thingName);
}

function resolveDeviceTopic(device, topicKey) {
  const template = device.topics[topicKey];
  if (!template) {
    throw new Error(`Device ${device.id} has no topic template for ${topicKey}`);
  }
  return formatDeviceTopic(template, device.thingName);
}

function requireArg(name, value) {
  if (!value || !value.trim()) {
    console.error(`\n❌ Missing required argument: ${name}`);
    console.error(`Usage: node scripts/provision-devices.mjs <locationId>\n`);
    process.exit(1);
  }
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) {
    console.error(`\n❌ Invalid ${name}: "${trimmed}" looks like a flag, not a location id.`);
    console.error(`Usage: node scripts/provision-devices.mjs <locationId>\n`);
    process.exit(1);
  }
  if (!/^[a-f0-9]+$/i.test(trimmed)) {
    console.error(`\n❌ Invalid ${name}: "${trimmed}" must be a hex location id.\n`);
    process.exit(1);
  }
  return trimmed;
}

async function main() {
  const outputs = readOutputs();
  const rawEnv = process.env;

  const env = validateEnv(provisionDevicesEnvSchema, {
    MAIN_TABLE_NAME:
      rawEnv.MAIN_TABLE_NAME || outputs.MainTableName || outputs.ExportsOutputRefMainTable74195DAB4503BD7E,
  });

  const mainTableName = env.MAIN_TABLE_NAME;
  if (!mainTableName) {
    throw new Error('MAIN_TABLE_NAME is required. Run `npm run deploy` and ensure cdk-outputs.json exists.');
  }

  const locationId = requireArg('locationId', process.argv[2]);
  const now = new Date().toISOString();

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  // Use the configured IoT fleet thing names as stable device identifiers.
  const scannerThing = getDeviceByType('scanner');
  const lockerThing = getDeviceByType('locker');

  const lockerId = lockerThing.thingName;
  const scannerId = scannerThing.thingName;

  // 1. Create / update the locker device record
  await ddb.send(
    new PutCommand({
      TableName: mainTableName,
      Item: {
        PK: `LOC#${locationId}`,
        SK: `DEV#${lockerId}`,
        device_id: lockerId,
        name: 'Locker Relay',
        type: 'lock',
        connection_params: {
          thing_name: lockerId,
          command_topic: resolveDeviceTopic(lockerThing, 'command'),
        },
        status: 'active',
        created_at: now,
      },
    })
  );
  console.log(`🔐 Locker provisioned: ${lockerId}`);

  // 2. Create / update the scanner record
  await ddb.send(
    new PutCommand({
      TableName: mainTableName,
      Item: {
        PK: `LOC#${locationId}`,
        SK: `SCANNER#${scannerId}`,
        scanner_id: scannerId,
        device_id: scannerId,
        location_id: locationId,
        name: 'QR Scanner',
        status: 'active',
        reader_adapter: 'mqtt',
        allowed_qr_providers: ['basic-subscription'],
        assigned_locker_id: lockerId,
        hardware_metadata: {
          thing_name: scannerId,
          scan_topic: resolveDeviceTopic(scannerThing, 'scan'),
          feedback_topic: resolveDeviceTopic(scannerThing, 'feedback'),
        },
        created_at: now,
        updated_at: now,
      },
    })
  );

  console.log(`📷 Scanner provisioned: ${scannerId}\n`);
}

main().catch((err) => {
  console.error('Provision devices failed:', err);
  process.exit(1);
});
