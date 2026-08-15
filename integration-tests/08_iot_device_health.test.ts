import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { EdgeIotDevice } from './lib/edge-iot-device.ts';
import { resolveIntegrationTestEnv } from './lib/env';
import { requireOutput } from './lib/stack-outputs.ts';
import {
  cleanupHealthCheckRecords,
  cleanupTestLocation,
  cleanupTestUser,
  createTestLocation,
  createTestUserSession,
  getTestContext,
} from './lib/test-helpers.ts';
import type { IntegrationTestContext, TestLocationRecord, TestUserSession } from './lib/types.ts';

interface HealthCheckResponse {
  device_id: string;
  status: 'ONLINE' | 'OFFLINE';
  connected: boolean;
  latency_ms: number;
  last_seen: string | null;
  thing_name: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDeviceHealth(
  context: IntegrationTestContext,
  adminToken: string,
  deviceId: string,
  locationId: string
): Promise<HealthCheckResponse> {
  const response = await fetch(
    `${context.apiUrl}/admin/devices/${encodeURIComponent(deviceId)}/health?location_id=${encodeURIComponent(locationId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    }
  );

  if (response.status !== 200) {
    const body = await response.text();
    throw new Error(`Health check failed (${response.status}): ${body}`);
  }

  return (await response.json()) as HealthCheckResponse;
}

async function waitForOnlineStatus(
  context: IntegrationTestContext,
  adminToken: string,
  deviceId: string,
  locationId: string,
  timeoutMs = 20000,
  intervalMs = 1000
): Promise<HealthCheckResponse> {
  const startedAt = Date.now();
  let lastResponse: HealthCheckResponse | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    const health = await checkDeviceHealth(context, adminToken, deviceId, locationId);
    lastResponse = health;
    if (health.connected && health.status === 'ONLINE' && health.last_seen) {
      return health;
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `Device ${deviceId} did not become ONLINE within ${timeoutMs}ms. Last response: ${JSON.stringify(lastResponse)}`
  );
}

describe('AWS IoT Device Provisioning and Health Integration', () => {
  let context: IntegrationTestContext;
  let adminSession: TestUserSession;
  let location: TestLocationRecord;
  let thingName: string;
  let iotEndpoint: string;
  let devicePresenceTableName: string;
  let edgeDevice: EdgeIotDevice;
  let certsTmpDir: string;

  before(async () => {
    context = await getTestContext();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    adminSession = await createTestUserSession(context, {
      email: `iot-admin-${uniqueSuffix}@example.com`,
      role: 'admin',
      withActiveSubscription: false,
    });

    location = await createTestLocation(context, adminSession.idToken, {
      name: `IoT Integration Location ${Date.now()}`,
      address: '100 IoT Integration Avenue',
    });

    [thingName, iotEndpoint, devicePresenceTableName] = await Promise.all([
      requireOutput('ThingNameOutput'),
      requireOutput('IotEndpointOutput'),
      requireOutput('DevicePresenceTableName'),
    ]);

    const secretName = await requireOutput('SecretNameOutput');
    const { AWS_REGION: region } = resolveIntegrationTestEnv();
    certsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossbox-iot-certs-'));
    execSync(`node ./scripts/fetch-certs.mjs "${certsTmpDir}"`, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SECRET_NAME_IOT: secretName,
        AWS_REGION: region,
      },
      stdio: 'pipe',
    });

    edgeDevice = EdgeIotDevice.fromCertBundleDir(thingName, certsTmpDir, iotEndpoint, 'gym');
  });

  after(async () => {
    if (location?.locationId) {
      await cleanupTestLocation(context, adminSession.idToken, location.locationId);
    }
    if (adminSession) {
      await cleanupTestUser(context, adminSession);
    }
    await cleanupHealthCheckRecords(context, thingName, devicePresenceTableName);
    if (certsTmpDir && fs.existsSync(certsTmpDir)) {
      fs.rmSync(certsTmpDir, { recursive: true, force: true });
    }
  });

  test('admin can add a device for the location using a real IoT thingName', async () => {
    const createResponse = await fetch(`${context.apiUrl}/admin/locations/${location.locationId}/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSession.idToken}`,
      },
      body: JSON.stringify({
        device_id: thingName,
        name: `IoT Scanner ${Date.now()}`,
        type: 'scanner',
        connection_params: {
          ip: '10.0.0.20',
          port: 1883,
        },
      }),
    });

    assert.ok(createResponse.status === 200 || createResponse.status === 201, 'Create device must return 200/201');
    const created = (await createResponse.json()) as { device_id?: string; PK?: string };
    assert.equal(created.device_id, thingName, 'Created device_id should match configured IoT thingName');

    const listResponse = await fetch(`${context.apiUrl}/admin/locations/${location.locationId}/devices`, {
      headers: { Authorization: `Bearer ${adminSession.idToken}` },
    });
    assert.equal(listResponse.status, 200, 'List devices must return 200');
    const devices = (await listResponse.json()) as Array<{ device_id?: string }>;
    assert.ok(
      devices.some((device) => device.device_id === thingName),
      'Newly added device must be listed'
    );
  });

  test('fetch-certs script downloads certificate bundle for configured IoT things', async () => {
    execSync(`node ./scripts/fetch-certs.mjs "${certsTmpDir}"`, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SECRET_NAME_IOT: await requireOutput('SecretNameOutput'),
        AWS_REGION: context.region,
      },
    });

    const thingDir = path.join(certsTmpDir, thingName);
    assert.ok(fs.existsSync(thingDir), `Certificate directory for ${thingName} must exist`);
    assert.ok(fs.existsSync(path.join(thingDir, 'certificate.pem.crt')), 'certificate.pem.crt must exist');
    assert.ok(fs.existsSync(path.join(thingDir, 'private.pem.key')), 'private.pem.key must exist');
    assert.ok(fs.existsSync(path.join(thingDir, 'AmazonRootCA1.pem')), 'AmazonRootCA1.pem must exist');
    assert.ok(fs.existsSync(path.join(thingDir, 'config.json')), 'config.json must exist');
  });

  test('edge device simulator lifecycle publishes to IoT Core and heartbeat marks device ONLINE', async () => {
    await edgeDevice.register();
    const registeredState = edgeDevice.probe();
    assert.equal(registeredState.registered, true, 'register() should mark device as registered');
    assert.equal(registeredState.connected, true, 'register() should connect using mTLS certs');

    await edgeDevice.on();
    const onState = edgeDevice.probe();
    assert.equal(onState.poweredOn, true, 'on() should power on device');
    assert.equal(onState.connected, true, 'on() should keep device connected');

    const health = await waitForOnlineStatus(context, adminSession.idToken, thingName, location.locationId);
    assert.equal(health.device_id, thingName);
    assert.equal(health.status, 'ONLINE');
    assert.equal(health.connected, true);
    assert.ok(health.last_seen, 'last_seen should be populated after heartbeat ingestion');

    await edgeDevice.off();
    const offState = edgeDevice.probe();
    assert.equal(offState.poweredOn, false, 'off() should power off device');
    assert.equal(offState.connected, false, 'off() should turn device offline');

    await edgeDevice.unregister();
    const unregisteredState = edgeDevice.probe();
    assert.equal(unregisteredState.registered, false, 'unregister() should unregister device');
    assert.equal(unregisteredState.connected, false, 'unregister() should disconnect device from IoT Core');
  });

  test('missing heartbeat device is reported as OFFLINE', async () => {
    const absentDeviceId = `missing-device-${Date.now()}`;
    const health = await checkDeviceHealth(context, adminSession.idToken, absentDeviceId, location.locationId);

    assert.equal(health.device_id, absentDeviceId);
    assert.equal(health.status, 'OFFLINE');
    assert.equal(health.connected, false);
    assert.equal(health.last_seen, null);
  });
});
