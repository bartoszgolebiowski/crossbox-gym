import { CognitoIdentityProviderClient, AdminInitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { requireOutput } from './stack-outputs.ts';

let cachedToken: string | undefined;

/** Fetches a valid admin JWT ID token for integration tests */
export async function getAdminIdToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const userPoolId = await requireOutput('UserPoolId');
  const clientId = await requireOutput('UserPoolClientId');
  const region = process.env.AWS_REGION || 'eu-central-1';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@crossboxgym.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

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
