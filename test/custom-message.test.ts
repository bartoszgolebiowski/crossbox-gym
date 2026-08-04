import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { handler } from '../lib/handlers/custom-message';

describe('Cognito custom message handler', () => {
  test('uses a password-reset template for forgot-password codes', async () => {
    const event = await handler({
      triggerSource: 'CustomMessage_ForgotPassword',
      request: { codeParameter: '{####}' },
      response: {},
    });

    assert.equal(event.response.emailSubject, 'Set your new Crossbox Gym password');
    assert.match(event.response.emailMessage ?? '', /set a new Crossbox Gym password/);
    assert.match(event.response.emailMessage ?? '', /\{####\}/);
  });

  test('leaves other Cognito messages unchanged', async () => {
    const event = await handler({
      triggerSource: 'CustomMessage_SignUp',
      request: { codeParameter: '{####}' },
      response: {},
    });

    assert.deepEqual(event.response, {});
  });
});
