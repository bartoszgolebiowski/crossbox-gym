import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CrossboxApiStack } from '../lib/stacks/api-stack';
import { CrossboxDataStack } from '../lib/stacks/data-stack';

test('CrossboxApiStack synthesizes EventBridge CRON warmer rules (max 5 targets per rule)', () => {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'eu-central-1' };

  const dataStack = new CrossboxDataStack(app, 'TestDataStack', { isTest: true, env });
  const apiStack = new CrossboxApiStack(app, 'TestApiStack', { isTest: true, dataStack, env });

  const template = Template.fromStack(apiStack);

  const rules = template.findResources('AWS::Events::Rule');
  let totalTargets = 0;
  let warmerRulesCount = 0;

  for (const key of Object.keys(rules)) {
    const r = rules[key];
    if (r.Properties?.ScheduleExpression === 'rate(5 minutes)') {
      warmerRulesCount++;
      const targets = r.Properties.Targets || [];
      assert.ok(targets.length <= 5, 'EventBridge rule must not exceed AWS limit of 5 targets per rule');
      totalTargets += targets.length;

      const inputTransformerOrPayload = targets[0]?.Input;
      assert.ok(inputTransformerOrPayload, 'Target should have input payload');
      const parsedPayload = JSON.parse(inputTransformerOrPayload);
      assert.strictEqual(parsedPayload.warmer, true);
      assert.strictEqual(parsedPayload.source, 'eventbridge.warmer');
      assert.strictEqual(parsedPayload.action, 'warmup');
    }
  }

  assert.ok(warmerRulesCount >= 2, 'Should create chunked rules for 7 targets');
  assert.strictEqual(totalTargets, 7, 'Total targeted API Lambdas across rules should be 7');
});
