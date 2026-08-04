export interface VerifyEntryEnvironment {
  mainTableName: string;
  entryLogsTableName: string;
  lockerClientType: string;
  iotEndpoint?: string;
  lockerThingName: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

export function loadVerifyEntryEnvironment(environment: NodeJS.ProcessEnv = process.env): VerifyEntryEnvironment {
  return {
    mainTableName: required(environment, 'MAIN_TABLE_NAME'),
    entryLogsTableName: required(environment, 'ENTRY_LOGS_TABLE_NAME'),
    lockerClientType: environment.LOCKER_CLIENT_TYPE?.trim() || 'mqtt',
    iotEndpoint: environment.IOT_ENDPOINT?.trim() || undefined,
    lockerThingName: environment.LOCKER_THING_NAME?.trim() || 'crossbox-locker-relay-01',
  };
}
