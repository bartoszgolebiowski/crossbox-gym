import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

export interface LockerConfig {
  endpoint: string;
  lockerThingName: string;
}

export interface ILockerConfigProvider {
  getConfig(): Promise<LockerConfig>;
}

export class SsmLockerConfigProvider implements ILockerConfigProvider {
  private ssm?: SSMClient;
  private cachedConfig?: LockerConfig;

  constructor(
    private readonly endpointParam: string = process.env.SSM_IOT_ENDPOINT_PARAM || '/crossbox/iot/endpoint',
    private readonly lockerParam: string = process.env.SSM_LOCKER_THING_NAME_PARAM || '/crossbox/iot/locker-thing-name'
  ) {}

  async getConfig(): Promise<LockerConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const envEndpoint = process.env.IOT_ENDPOINT;
    const envLocker = process.env.LOCKER_THING_NAME;

    try {
      if (!this.ssm) {
        this.ssm = new SSMClient({});
      }

      const res = await this.ssm.send(
        new GetParametersCommand({
          Names: [this.endpointParam, this.lockerParam],
          WithDecryption: false,
        })
      );

      const map = new Map<string, string>();
      for (const p of res.Parameters || []) {
        if (p.Name && p.Value) {
          map.set(p.Name, p.Value);
        }
      }

      const endpoint = map.get(this.endpointParam) || envEndpoint || '';
      const lockerThingName = map.get(this.lockerParam) || envLocker || 'crossbox-locker-relay-01';

      this.cachedConfig = { endpoint, lockerThingName };
      return this.cachedConfig;
    } catch (err) {
      console.warn('[SsmLockerConfigProvider] Failed to fetch SSM parameters, falling back to environment/defaults:', err);
      this.cachedConfig = {
        endpoint: envEndpoint || '',
        lockerThingName: envLocker || 'crossbox-locker-relay-01',
      };
      return this.cachedConfig;
    }
  }
}
