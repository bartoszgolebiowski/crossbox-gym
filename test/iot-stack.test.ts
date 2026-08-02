import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CrossboxDataStack } from '../lib/stacks/data-stack';
import { CrossboxApiStack } from '../lib/stacks/api-stack';
import { CrossboxIotStack } from '../lib/stacks/iot-stack';

test('CrossboxIotStack synthesizes required IoT resources', () => {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'eu-central-1' };

  const dataStack = new CrossboxDataStack(app, 'TestDataStack', { isTest: true, env });
  const apiStack = new CrossboxApiStack(app, 'TestApiStack', { isTest: true, dataStack, env });
  const iotStack = new CrossboxIotStack(app, 'TestIotStack', { isTest: true, apiStack, env });

  const template = Template.fromStack(iotStack);

  // Assert IoT Thing
  template.hasResourceProperties('AWS::IoT::Thing', {
    ThingName: 'hd360-qr-scanner-01',
    AttributePayload: {
      Attributes: {
        device_type: 'HDWR-HD360-QR-Scanner',
        version: '1.0.0',
      },
    },
  });

  // Assert IoT Policy
  template.hasResourceProperties('AWS::IoT::Policy', {
    PolicyName: 'hd360-qr-scanner-policy',
  });

  // Assert Secrets Manager Secret
  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    Name: 'hd360-qr-scanner/certs',
  });

  // Assert IoT Topic Rule
  template.hasResourceProperties('AWS::IoT::TopicRule', {
    RuleName: 'QrScannerScanRule',
    TopicRulePayload: {
      Sql: "SELECT *, topic(3) as scannerId FROM 'gym/scanners/+/scan'",
      RuleDisabled: false,
    },
  });

  assert.ok(iotStack);
});
