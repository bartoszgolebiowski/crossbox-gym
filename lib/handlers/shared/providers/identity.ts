import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'crypto';
import { IdentityProvider } from './types';

/**
 * Generates a high-entropy temporary password compliant with Cognito password policies.
 */
function generateStrongTemporaryPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = randomBytes(16);
  let password = 'Aa1!'; // Guarantees upper, lower, number, special char
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

export class CognitoIdentityProvider implements IdentityProvider {
  private cognito = new CognitoIdentityProviderClient({});

  async ensureUser(userPoolId: string, email: string): Promise<string> {
    try {
      const tempPassword = generateStrongTemporaryPassword();
      const createRes = await this.cognito.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        TemporaryPassword: tempPassword,
        MessageAction: 'SUPPRESS',
        UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }]
      }));
      await this.cognito.send(new AdminResetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
      }));
      return createRes.User?.Attributes?.find(a => a.Name === 'sub')?.Value || '';
    } catch (e: any) {
      if (e.name === 'UsernameExistsException') {
        const existingUser = await this.cognito.send(new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: email
        }));
        return existingUser.UserAttributes?.find(a => a.Name === 'sub')?.Value || '';
      }
      throw e;
    }
  }
}

export class MockIdentityProvider implements IdentityProvider {
  async ensureUser(_userPoolId: string, _email: string): Promise<string> {
    return `sub_mock_${Date.now()}`;
  }
}

const identityProviders: Record<string, new () => IdentityProvider> = {
  cognito: CognitoIdentityProvider,
  mock: MockIdentityProvider,
};

export function createIdentityProvider(type: string): IdentityProvider {
  const ProviderClass = identityProviders[type] || CognitoIdentityProvider;
  return new ProviderClass();
}
