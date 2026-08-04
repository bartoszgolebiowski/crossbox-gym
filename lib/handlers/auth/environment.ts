import {
  getFrontendUrl,
  getIdentityProvider,
  getMainTableName,
  getUserPoolClientId,
  getUserPoolId,
} from '../shared/config';

export interface AuthEnvironment {
  mainTableName: string;
  userPoolId: string;
  userPoolClientId: string;
  frontendUrl: string;
  identityProvider: string;
}

export function loadAuthEnvironment(_env = process.env): AuthEnvironment {
  return {
    mainTableName: getMainTableName(),
    userPoolId: getUserPoolId(),
    userPoolClientId: getUserPoolClientId(),
    frontendUrl: getFrontendUrl(),
    identityProvider: getIdentityProvider(),
  };
}
