import rawIotFleet from './iot-fleet.json';
import rawSsmPaths from './ssm-paths.json';

export interface SsmPaths {
  stripe: {
    secretKey: string;
  };
  iot: {
    endpoint: string;
    lockerThingName: string;
    scannerThingName: string;
  };
}

export interface IotDeviceTopics {
  scan?: string;
  feedback?: string;
  command?: string;
  heartbeat?: string;
}

export interface IotDevice {
  id: string;
  thingName: string;
  type: 'scanner' | 'locker';
  deviceType: string;
  attributes: Record<string, string>;
  isCertPrimary?: boolean;
  topics: IotDeviceTopics;
  ssm?: {
    thingNameParameter?: boolean;
  };
  outputs: Record<string, string>;
}

export interface IotFleet {
  policyName: string;
  secretName: string;
  topicNamespace: string;
  scannerTopicRule: {
    name: string;
    sql: string;
  };
  heartbeatTopicRule: {
    name: string;
    sql: string;
  };
  devices: IotDevice[];
}

const ssmPaths: SsmPaths = rawSsmPaths;
export const iotFleet: IotFleet = rawIotFleet as unknown as IotFleet;

export const SSM_PATH_STRIPE_SECRET_KEY = ssmPaths.stripe.secretKey;
export const SSM_IOT_ENDPOINT_PARAM = ssmPaths.iot.endpoint;
export const SSM_LOCKER_THING_NAME_PARAM = ssmPaths.iot.lockerThingName;
export const SSM_SCANNER_THING_NAME_PARAM = ssmPaths.iot.scannerThingName;

export function resolveDeviceTopic(device: IotDevice, topicKey: keyof IotDeviceTopics): string {
  return formatDeviceTopic(getDeviceTopicTemplate(device, topicKey), device.thingName);
}

export function getDeviceTopicTemplate(device: IotDevice, topicKey: keyof IotDeviceTopics): string {
  const template = device.topics[topicKey];
  if (!template) {
    throw new Error(`Device ${device.id} has no topic template for ${topicKey}`);
  }
  return template;
}

export function formatDeviceTopic(template: string, thingName: string): string {
  return template.replace(/\{thingName\}/g, thingName);
}

export function getDeviceByType(type: IotDevice['type']): IotDevice {
  const device = iotFleet.devices.find((d) => d.type === type);
  if (!device) {
    throw new Error(`No IoT fleet device configured for type: ${type}`);
  }
  return device;
}
