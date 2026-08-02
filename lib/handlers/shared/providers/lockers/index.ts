import { ILockerClient } from './types';
import { MockLockerClient } from './mock-locker';
import { MqttLockerClient } from './mqtt-locker';

export * from './types';
export * from './mock-locker';
export * from './mqtt-locker';

export function createLockerClient(type?: string, endpoint?: string): ILockerClient {
  const clientType = type || process.env.LOCKER_CLIENT_TYPE || 'mqtt';
  if (clientType === 'mock') {
    return new MockLockerClient();
  }
  return new MqttLockerClient(endpoint);
}
