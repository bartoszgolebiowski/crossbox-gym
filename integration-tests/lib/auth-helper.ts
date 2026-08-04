import { AdminInitiateAuthCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { resolveIntegrationTestEnv } from './env';
import { requireOutput } from './stack-outputs.ts';

let cachedToken: string | undefined;

/** Fetches a valid admin JWT ID token for integration tests */
export async function getAdminIdToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const env = resolveIntegrationTestEnv();
  const userPoolId = await requireOutput('UserPoolId');
  const clientId = await requireOutput('UserPoolClientId');
  const region = env.AWS_REGION;
  const adminEmail = env.ADMIN_EMAIL;
  const adminPassword = env.ADMIN_PASSWORD;

  const cognito = new CognitoIdentityProviderClient({ region });
  const authRes = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: adminEmail,
        PASSWORD: adminPassword,
      },
    })
  );

  const token = authRes.AuthenticationResult?.IdToken;
  if (!token) {
    throw new Error('Failed to obtain Cognito IdToken for integration tests');
  }

  cachedToken = token;
  return token;
}
