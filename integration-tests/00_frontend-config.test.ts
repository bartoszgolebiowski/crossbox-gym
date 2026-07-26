import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { requireOutput } from './lib/stack-outputs';

function asUrl(domain: string): URL {
  return new URL(domain.startsWith('http') ? domain : `https://${domain}`);
}

describe('deployed frontend runtime configuration', () => {
  test('member and admin CloudFront sites publish the API Gateway URL', async () => {
    const [apiUrl, appDomain, adminDomain] = await Promise.all([
      requireOutput('ApiUrl'),
      requireOutput('AppCloudFrontUrl'),
      requireOutput('AdminCloudFrontUrl'),
    ]);

    const expectedApiUrl = new URL(apiUrl).toString().replace(/\/+$/, '');
    const sites = [asUrl(appDomain), asUrl(adminDomain)];

    for (const site of sites) {
      const response = await fetch(new URL('/config.json', site));
      assert.equal(response.ok, true, `${site.origin}/config.json should be available`);

      const config = await response.json() as { ApiUrl?: string };
      assert.equal(config.ApiUrl?.replace(/\/+$/, ''), expectedApiUrl);
      assert.notEqual(new URL(config.ApiUrl!).origin, site.origin);
    }
  });
});