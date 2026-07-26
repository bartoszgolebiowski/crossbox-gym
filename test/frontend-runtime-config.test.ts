import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadRuntimeConfig, normalizeApiUrl } from '../frontend/shared/runtimeConfig';

describe('frontend runtime configuration', () => {
  test('uses and normalizes the API Gateway URL in config.json', async () => {
    const config = await loadRuntimeConfig({
      fetchConfig: async () => new Response(JSON.stringify({
        ApiUrl: 'https://example.execute-api.eu-central-1.amazonaws.com/',
        UserPoolId: 'pool-id',
      }), { status: 200 }),
    });

    assert.equal(config.ApiUrl, 'https://example.execute-api.eu-central-1.amazonaws.com');
    assert.equal(config.UserPoolId, 'pool-id');
  });

  test('rejects empty ApiUrl rather than using the site origin', async () => {
    await assert.rejects(
      () => loadRuntimeConfig({
        fetchConfig: async () => new Response(JSON.stringify({ ApiUrl: '' }), { status: 200 }),
      }),
      /missing ApiUrl/i,
    );
  });

  test('rejects malformed and non-HTTP API URLs', () => {
    assert.throws(() => normalizeApiUrl('not-an-url'), /invalid ApiUrl/i);
    assert.throws(() => normalizeApiUrl('ftp://api.example.com'), /must use HTTP or HTTPS/i);
  });

  test('uses an explicit development fallback only after config loading fails', async () => {
    const config = await loadRuntimeConfig({
      fetchConfig: async () => {
        throw new Error('network unavailable');
      },
      fallbackApiUrl: 'http://localhost:3000/',
    });

    assert.equal(config.ApiUrl, 'http://localhost:3000');
  });

  test('does not substitute a browser origin when config loading fails', async () => {
    await assert.rejects(
      () => loadRuntimeConfig({
        fetchConfig: async () => {
          throw new Error('network unavailable');
        },
      }),
      /cannot contact its API/i,
    );
  });
});