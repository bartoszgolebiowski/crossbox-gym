import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'crypto';
import { EnsureUserResult, IdentityProvider } from './types';

function generateStrongTemporaryPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = randomBytes(16);
  let password = 'Aa1!';
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

export class CognitoIdentityProvider implements IdentityProvider {
  private cognito = new CognitoIdentityProviderClient({});

  async ensureUser(userPoolId: string, email: string): Promise<EnsureUserResult> {
    try {
      const tempPassword = generateStrongTemporaryPassword();
      const createRes = await this.cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          TemporaryPassword: tempPassword,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
        })
      );
      const sub = createRes.User?.Attributes?.find((a) => a.Name === 'sub')?.Value || '';
      return { sub, created: true };
    } catch (e: any) {
      if (e.name === 'UsernameExistsException') {
        const existingUser = await this.cognito.send(
          new AdminGetUserCommand({
            UserPoolId: userPoolId,
            Username: email,
          })
        );
        const sub = existingUser.UserAttributes?.find((a) => a.Name === 'sub')?.Value || '';
        return { sub, created: false };
      }
      throw e;
    }
  }
}

export class MockIdentityProvider implements IdentityProvider {
  async ensureUser(_userPoolId: string, _email: string): Promise<EnsureUserResult> {
    return { sub: `sub_mock_${Date.now()}`, created: true };
  }
}
