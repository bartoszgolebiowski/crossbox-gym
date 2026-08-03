import { ILockerClient } from './types';
import { MockLockerClient } from './mock-locker';
import { MqttLockerClient } from './mqtt-locker';
import { ILockerConfigProvider } from './ssm-config-provider';

export * from './types';
export * from './mock-locker';
export * from './mqtt-locker';
export * from './ssm-config-provider';

let lockerClientOverrideInstance: ILockerClient | undefined;

export function setLockerClientOverride(client?: ILockerClient): void {
  lockerClientOverrideInstance = client;
}

export function createLockerClient(
  type?: string,
  configProviderOrEndpoint?: string | ILockerConfigProvider
): ILockerClient {
  if (lockerClientOverrideInstance) {
    return lockerClientOverrideInstance;
  }
  const clientType = type || process.env.LOCKER_CLIENT_TYPE || 'mqtt';
  if (clientType === 'mock') {
    return new MockLockerClient();
  }
  return new MqttLockerClient(configProviderOrEndpoint);
}
