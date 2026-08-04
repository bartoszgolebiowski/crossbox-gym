import { SSM_IOT_ENDPOINT_PARAM, SSM_LOCKER_THING_NAME_PARAM } from '../../../../config';
import { MockLockerClient } from './mock-locker';
import { MqttLockerClient } from './mqtt-locker';
import { ILockerConfigProvider, LockerConfig, SsmLockerConfigProvider } from './ssm-config-provider';
import { ILockerClient } from './types';

export * from './mock-locker';
export * from './mqtt-locker';
export * from './ssm-config-provider';
export * from './types';

let lockerClientOverrideInstance: ILockerClient | undefined;

export function setLockerClientOverride(client?: ILockerClient): void {
  lockerClientOverrideInstance = client;
}

export function createLockerClient(
  type: string,
  configProviderOrEndpoint?: string | ILockerConfigProvider | LockerConfig
): ILockerClient {
  if (lockerClientOverrideInstance) {
    return lockerClientOverrideInstance;
  }
  if (type === 'mock') {
    return new MockLockerClient();
  }
  if (!configProviderOrEndpoint) {
    throw new Error('Locker configuration is required for MQTT clients');
  }
  if (typeof configProviderOrEndpoint === 'string' || 'getConfig' in configProviderOrEndpoint) {
    return new MqttLockerClient(configProviderOrEndpoint);
  }
  return new MqttLockerClient(
    new SsmLockerConfigProvider({
      endpointParameterName: SSM_IOT_ENDPOINT_PARAM,
      lockerThingNameParameterName: SSM_LOCKER_THING_NAME_PARAM,
      fallbackConfig: configProviderOrEndpoint,
    })
  );
}
