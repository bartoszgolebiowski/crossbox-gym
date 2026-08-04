import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { resolveIntegrationTestEnv } from './lib/env';
import { requireOutput } from './lib/stack-outputs.ts';

async function getDeviceCertFromSecret(secretName: string, thingName: string, region: string) {
  const secretsClient = new SecretsManagerClient({ region });
  const secretResponse = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretName }));

  assert.ok(secretResponse.SecretString, 'SecretString must exist');
  const payload = JSON.parse(secretResponse.SecretString);

  // New per-device format: { "thingName": { certificate_pem, ... } }
  const deviceCert = payload?.[thingName] ?? payload;
  assert.ok(deviceCert, `Certificate entry for ${thingName} must exist`);
  return deviceCert;
}

describe('AWS IoT Core Connection & Provisioning Integration Suite', () => {
  test('CloudFormation stack outputs publish IoT stack resources', async () => {
    const [secretName, thingName, iotEndpoint] = await Promise.all([
      requireOutput('SecretNameOutput'),
      requireOutput('ThingNameOutput'),
      requireOutput('IotEndpointOutput'),
    ]);

    assert.ok(secretName, 'SecretNameOutput must be defined');
    assert.ok(thingName, 'ThingNameOutput must be defined');
    assert.ok(iotEndpoint, 'IotEndpointOutput must be defined');
    assert.match(iotEndpoint, /\.iot\.[a-z0-9-]+\.amazonaws\.com$/);
  });

  test('Secrets Manager contains valid per-device mTLS X.509 certificates and ATS endpoint configuration', async () => {
    const [secretName, thingName, expectedEndpoint] = await Promise.all([
      requireOutput('SecretNameOutput'),
      requireOutput('ThingNameOutput'),
      requireOutput('IotEndpointOutput'),
    ]);
    const { AWS_REGION: region } = resolveIntegrationTestEnv();

    const payload = await getDeviceCertFromSecret(secretName, thingName, region);

    // Validate certificate payload contents
    assert.ok(payload.certificate_pem, 'certificate_pem must be present');
    assert.ok(payload.private_key, 'private_key must be present');
    assert.ok(payload.root_ca, 'root_ca must be present');
    assert.ok(payload.certificate_arn, 'certificate_arn must be present');
    assert.ok(payload.certificate_id, 'certificate_id must be present');
    assert.ok(payload.endpoint_address, 'endpoint_address must be present');

    // Validate format of PEM files
    assert.match(payload.certificate_pem, /-----BEGIN CERTIFICATE-----/);
    assert.match(payload.private_key, /-----BEGIN (RSA )?PRIVATE KEY-----/);
    assert.match(payload.root_ca, /-----BEGIN CERTIFICATE-----/);
    assert.equal(payload.endpoint_address, expectedEndpoint);
  });

  test('AWS IoT Data Plane connection is ready and active', async () => {
    const iotEndpoint = await requireOutput('IotEndpointOutput');
    const { AWS_REGION: region } = resolveIntegrationTestEnv();

    const iotDataClient = new IoTDataPlaneClient({
      endpoint: `https://${iotEndpoint}`,
      region,
    });

    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      source: 'integration-test-connection-check',
    };

    const res = await iotDataClient.send(
      new PublishCommand({
        topic: 'gym/scanners/test-connection/feedback',
        qos: 1,
        payload: Buffer.from(JSON.stringify(testPayload)),
      })
    );

    assert.equal(res.$metadata.httpStatusCode, 200, 'IoT Data Plane publish should return HTTP 200');
  });

  test('fetch-certs script successfully downloads certificate bundle', async () => {
    const secretName = await requireOutput('SecretNameOutput');
    const { AWS_REGION: region } = resolveIntegrationTestEnv();
    const tmpDir = path.join(process.cwd(), 'certs_test_tmp');

    try {
      execSync(`node ./scripts/fetch-certs.mjs "${tmpDir}"`, {
        cwd: process.cwd(),
        env: { ...process.env, SECRET_NAME_IOT: secretName, AWS_REGION: region },
        stdio: 'pipe',
      });

      const subdirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
      assert.ok(subdirs.length > 0, 'At least one thing certificate folder must be created');

      const certDir = path.join(tmpDir, subdirs[0]);
      assert.ok(fs.existsSync(path.join(certDir, 'certificate.pem.crt')), 'certificate.pem.crt must exist');
      assert.ok(fs.existsSync(path.join(certDir, 'private.pem.key')), 'private.pem.key must exist');
      assert.ok(fs.existsSync(path.join(certDir, 'config.json')), 'config.json must exist');

      const config = JSON.parse(fs.readFileSync(path.join(certDir, 'config.json'), 'utf8'));
      assert.ok(config.endpoint_address || config.endpoint, 'config.json must contain endpoint');
      assert.ok(config.certificate_arn !== undefined, 'config.json must contain certificate_arn property');
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });
});
