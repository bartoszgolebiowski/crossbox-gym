import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isWarmingEvent, withWarming, withHandler } from '../lib/handlers/shared/http/middleware';

describe('Lambda Warmer HOF and Middleware', () => {
  describe('isWarmingEvent', () => {
    it('identifies custom warmer payload: warmer=true', () => {
      assert.strictEqual(isWarmingEvent({ warmer: true }), true);
    });

    it('identifies custom warmer payload: isWarming=true', () => {
      assert.strictEqual(isWarmingEvent({ isWarming: true }), true);
    });

    it('identifies custom warmer payload: action=warmup', () => {
      assert.strictEqual(isWarmingEvent({ action: 'warmup' }), true);
    });

    it('identifies EventBridge Scheduled Event default payload', () => {
      const scheduledEvent = {
        source: 'aws.events',
        'detail-type': 'Scheduled Event',
        resources: ['arn:aws:events:us-east-1:123456789012:rule/my-scheduled-rule'],
      };
      assert.strictEqual(isWarmingEvent(scheduledEvent), true);
    });

    it('identifies serverless-plugin-warmup source', () => {
      assert.strictEqual(isWarmingEvent({ source: 'serverless-plugin-warmup' }), true);
      assert.strictEqual(isWarmingEvent({ source: 'eventbridge.warmer' }), true);
    });

    it('identifies HTTP ping query parameter or header', () => {
      assert.strictEqual(isWarmingEvent({ queryStringParameters: { warmup: 'true' } }), true);
      assert.strictEqual(isWarmingEvent({ headers: { 'x-ping': 'warmup' } }), true);
    });

    it('returns false for standard API Gateway events or invalid objects', () => {
      assert.strictEqual(isWarmingEvent(null), false);
      assert.strictEqual(isWarmingEvent(undefined), false);
      assert.strictEqual(isWarmingEvent({ path: '/api/member/me', httpMethod: 'GET' }), false);
    });
  });

  describe('withWarming HOF', () => {
    it('short-circuits and returns 200 status for warming events without executing business logic', async () => {
      let executed = false;
      const dummyHandler = async (_evt: any) => {
        executed = true;
        return { statusCode: 200, body: 'real response' };
      };

      const wrapped = withWarming(dummyHandler);
      const res = await wrapped({ warmer: true, source: 'eventbridge.warmer' });

      assert.strictEqual(executed, false, 'Wrapped handler must not execute business logic for warming events');
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.status, 'warmed');
      assert.ok(body.timestamp);
    });

    it('delegates normal events to wrapped handler', async () => {
      let executed = false;
      const dummyHandler = async (evt: any) => {
        executed = true;
        return { statusCode: 200, body: `hello ${evt.name}` };
      };

      const wrapped = withWarming(dummyHandler);
      const res = await wrapped({ name: 'World' });

      assert.strictEqual(executed, true);
      assert.strictEqual(res.body, 'hello World');
    });
  });

  describe('withHandler HTTP middleware warming support', () => {
    it('intercepts warming events at top of HTTP middleware chain', async () => {
      let executed = false;
      const apiHandler = async (_evt: any) => {
        executed = true;
        return { data: 'ok' };
      };

      const wrappedApi = withHandler(apiHandler);
      const result = await wrappedApi({ warmer: true } as any);

      assert.strictEqual(executed, false);
      assert.strictEqual((result as any).statusCode, 200);
      const parsed = JSON.parse((result as any).body);
      assert.strictEqual(parsed.status, 'warmed');
    });
  });
});
