import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AuthIdentityProvider, MockAuthIdentityProvider } from '../lib/handlers/auth/identity-provider';
import { AuthRepository } from '../lib/handlers/auth/repository';
import { AuthService } from '../lib/handlers/auth/service';
import { MagicLinkRateLimit, MagicLinkToken } from '../lib/handlers/shared/types';

class FakeAuthRepository implements AuthRepository {
  tokens = new Map<string, MagicLinkToken>();
  rateLimits = new Map<string, MagicLinkRateLimit>();
  passwordSetUpdates: string[] = [];
  createdProfiles: Array<{ sub: string; email: string; role: string }> = [];

  async getMagicLinkToken(tokenHash: string): Promise<MagicLinkToken | undefined> {
    return this.tokens.get(tokenHash);
  }

  async saveMagicLinkToken(tokenHash: string, email: string, ttl: number): Promise<void> {
    this.tokens.set(tokenHash, {
      PK: `TOKEN#${tokenHash}`,
      SK: 'TOKEN',
      user_id: email,
      created_at: new Date().toISOString(),
      ttl,
    });
  }

  async getMagicLinkRateLimit(email: string): Promise<MagicLinkRateLimit | undefined> {
    return this.rateLimits.get(email);
  }

  async saveMagicLinkRateLimit(email: string, requestCount: number, windowStart: string, ttl: number): Promise<void> {
    this.rateLimits.set(email, {
      PK: `RATELIMIT#${email}`,
      SK: 'RATELIMIT',
      request_count: requestCount,
      window_start: windowStart,
      ttl,
    });
  }

  async updatePasswordSet(sub: string): Promise<void> {
    this.passwordSetUpdates.push(sub);
  }

  async createUserProfile(sub: string, email: string, role: string): Promise<void> {
    this.createdProfiles.push({ sub, email, role });
  }
}

describe('AuthService', () => {
  const fixedNow = new Date('2026-01-01T12:00:00.000Z');
  const fixedRandomBytes = Buffer.from('a'.repeat(32), 'ascii');
  const expectedToken = fixedRandomBytes.toString('hex');

  function createService(overrides: { repository?: FakeAuthRepository; identityProvider?: AuthIdentityProvider } = {}) {
    const repository = overrides.repository || new FakeAuthRepository();
    const identityProvider = overrides.identityProvider || new MockAuthIdentityProvider();
    return {
      service: new AuthService({
        repository,
        identityProvider,
        frontendUrl: 'https://app.example.test',
        now: () => fixedNow,
        randomBytes: () => fixedRandomBytes,
      }),
      repository,
      identityProvider,
    };
  }

  test('login requires email and password', async () => {
    const { service } = createService();
    await assert.rejects(() => service.login('', 'password'), /Email and password are required/);
    await assert.rejects(() => service.login('user@example.test', ''), /Email and password are required/);
  });

  test('login returns tokens on valid credentials', async () => {
    const identityProvider = new MockAuthIdentityProvider();
    await identityProvider.register('user@example.test', 'Secret123');

    const { service } = createService({ identityProvider });
    const result = await service.login('user@example.test', 'Secret123');

    assert.equal(result.accessToken, 'mock-access-token');
    assert.equal(result.expiresIn, 3600);
  });

  test('login propagates invalid credential errors', async () => {
    const identityProvider = new MockAuthIdentityProvider();
    await identityProvider.register('user@example.test', 'Secret123');

    const { service } = createService({ identityProvider });
    await assert.rejects(() => service.login('user@example.test', 'wrong'), /Invalid email or password/);
  });

  test('register creates identity, profile, and returns sub', async () => {
    const { service, repository } = createService();
    const result = await service.register('new@example.test', 'Secret123');

    assert.equal(result.email, 'new@example.test');
    assert.equal(result.sub, 'sub_new@example.test');
    assert.equal(repository.createdProfiles.length, 1);
    assert.deepEqual(repository.createdProfiles[0], {
      sub: 'sub_new@example.test',
      email: 'new@example.test',
      role: 'member',
    });
  });

  test('register requires email and password', async () => {
    const { service } = createService();
    await assert.rejects(() => service.register('', 'Secret123'), /Email and password are required/);
    await assert.rejects(() => service.register('user@example.test', ''), /Email and password are required/);
  });

  test('createMagicLink saves token and rate limit', async () => {
    const { service, repository } = createService();
    const result = await service.createMagicLink('user@example.test');

    assert.ok(result.magicUrl.includes(expectedToken));
    assert.ok(result.magicUrl.includes(encodeURIComponent('user@example.test')));
    assert.equal(repository.rateLimits.get('user@example.test')?.request_count, 1);
    assert.equal(repository.tokens.size, 1);
  });

  test('createMagicLink rejects when rate limit exceeded', async () => {
    const repository = new FakeAuthRepository();
    repository.rateLimits.set('user@example.test', {
      PK: 'RATELIMIT#user@example.test',
      SK: 'RATELIMIT',
      request_count: 5,
      window_start: fixedNow.toISOString(),
      ttl: Math.floor(fixedNow.getTime() / 1000) + 3600,
    });

    const { service } = createService({ repository });
    await assert.rejects(
      () => service.createMagicLink('user@example.test'),
      /Magic link request limit reached. Please try again in an hour./
    );
  });

  test('verifyMagicLink succeeds for valid token', async () => {
    const repository = new FakeAuthRepository();
    const { service } = createService({ repository });
    await service.createMagicLink('user@example.test');

    const result = await service.verifyMagicLink(expectedToken, 'user@example.test');
    assert.equal(result.verified, true);
    assert.equal(result.email, 'user@example.test');
  });

  test('verifyMagicLink rejects invalid token', async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.verifyMagicLink('bad-token', 'user@example.test'),
      /Invalid or expired magic link token/
    );
  });

  test('setPassword updates password and profile flag', async () => {
    const identityProvider = new MockAuthIdentityProvider();
    await identityProvider.register('user@example.test', 'Secret123');

    const { service, repository } = createService({ identityProvider });
    const result = await service.setPassword('sub_user', 'user@example.test', 'NewSecret123');

    assert.equal(result.message, 'Password updated successfully');
    assert.deepEqual(repository.passwordSetUpdates, ['sub_user']);
  });

  test('setPassword rejects short password', async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.setPassword('sub', 'user@example.test', 'short'),
      /Password must be at least 8 characters long/
    );
  });

  test('forgotPassword requires email', async () => {
    const { service } = createService();
    await assert.rejects(() => service.forgotPassword(''), /Email is required/);
  });

  test('resetPassword validates token and resets password', async () => {
    const identityProvider = new MockAuthIdentityProvider();
    await identityProvider.register('user@example.test', 'Secret123');

    const repository = new FakeAuthRepository();
    const { service } = createService({ repository, identityProvider });
    await service.createMagicLink('user@example.test');

    const result = await service.resetPassword('user@example.test', expectedToken, 'NewSecret123');
    assert.equal(result.message, 'Password reset successfully');
  });

  test('resetPassword rejects invalid token', async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.resetPassword('user@example.test', 'bad-token', 'NewSecret123'),
      /Invalid or expired reset token/
    );
  });

  test('confirmForgotPassword resets password and updates profile when sub is known', async () => {
    const identityProvider = new MockAuthIdentityProvider();
    await identityProvider.register('user@example.test', 'Secret123');

    const { service, repository } = createService({ identityProvider });
    const result = await service.confirmForgotPassword('user@example.test', '123456', 'NewSecret123');

    assert.equal(result.message, 'Password reset confirmed successfully');
    assert.deepEqual(repository.passwordSetUpdates, ['sub_user@example.test']);
  });
});
