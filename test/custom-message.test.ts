import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { handler } from '../lib/handlers/custom-message';

describe('Cognito custom message handler', () => {
  test('uses welcome template for AdminCreateUser codes', async () => {
    const event = await handler({
      triggerSource: 'CustomMessage_AdminCreateUser',
      request: { codeParameter: '{####}' },
      response: {},
    });

    assert.equal(event.response.emailSubject, 'Witaj w CrossBox Gym 24/7! Ustaw swoje hasło');
    assert.match(event.response.emailMessage ?? '', /Witaj w CrossBox Gym 24\/7!/);
    assert.match(event.response.emailMessage ?? '', /\{####\}/);
  });

  test('uses password-reset template for forgot-password codes', async () => {
    const event = await handler({
      triggerSource: 'CustomMessage_ForgotPassword',
      request: { codeParameter: '{####}' },
      response: {},
    });

    assert.equal(event.response.emailSubject, 'Resetuj swoje hasło w CrossBox Gym 24/7');
    assert.match(event.response.emailMessage ?? '', /ustawić nowe hasło/);
    assert.match(event.response.emailMessage ?? '', /\{####\}/);
  });

  test('uses verification template for sign-up and resend-code triggers', async () => {
    const event = await handler({
      triggerSource: 'CustomMessage_SignUp',
      request: { codeParameter: '{####}' },
      response: {},
    });

    assert.equal(event.response.emailSubject, 'Witaj w CrossBox Gym 24/7! Zweryfikuj swoje konto');
    assert.match(event.response.emailMessage ?? '', /Twój kod weryfikacyjny to/);
    assert.match(event.response.emailMessage ?? '', /\{####\}/);
  });

  test('leaves unknown Cognito messages unchanged', async () => {
    const event = await handler({
      triggerSource: 'CustomMessage_UpdateUserAttribute',
      request: { codeParameter: '{####}' },
      response: {},
    });

    assert.deepEqual(event.response, {});
  });
});
