import { LambdaEnv, validateLambdaEnv } from '../shared/config';

export interface VerifyEntryEnvironment {
  mainTableName: string;
  entryLogsTableName: string;
  lockerClientType: string;
  iotEndpoint?: string;
  lockerThingName: string;
}

export function loadVerifyEntryEnvironment(env: NodeJS.ProcessEnv = process.env): VerifyEntryEnvironment {
  const validated = validateLambdaEnv(env) as LambdaEnv;
  return {
    mainTableName: validated.MAIN_TABLE_NAME,
    entryLogsTableName: validated.ENTRY_LOGS_TABLE_NAME,
    lockerClientType: validated.LOCKER_CLIENT_TYPE,
    iotEndpoint: validated.IOT_ENDPOINT,
    lockerThingName: validated.LOCKER_THING_NAME,
  };
}
