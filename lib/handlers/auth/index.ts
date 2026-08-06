import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ddb } from '../shared/db';
import { withHandler } from '../shared/http';
import { loadAuthEnvironment } from './environment';
import { CognitoAuthIdentityProvider } from './identity-provider';
import { DynamoDbAuthRepository } from './repository';
import { createAuthRouter } from './router';
import { AuthService } from './service';

export const handler = async (event: APIGatewayProxyEventV2) => {
  const environment = loadAuthEnvironment();
  const repository = new DynamoDbAuthRepository(ddb, environment.mainTableName);
  const cognitoClient = new CognitoIdentityProviderClient({});
  const identityProvider = new CognitoAuthIdentityProvider(
    cognitoClient,
    environment.userPoolId,
    environment.userPoolClientId
  );
  const service = new AuthService({
    repository,
    identityProvider,
    frontendUrl: environment.frontendUrl,
  });
  return withHandler(createAuthRouter(service))(event);
};
