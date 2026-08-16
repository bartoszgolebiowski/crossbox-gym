import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import tls from 'node:tls';

export interface EdgeDeviceState {
  registered: boolean;
  poweredOn: boolean;
  connected: boolean;
}

export interface EdgeIotDeviceOptions {
  thingName: string;
  endpoint: string;
  certificatePath: string;
  privateKeyPath: string;
  rootCaPath?: string;
  clientId?: string;
  topicNamespace?: string;
  listenerHost?: string;
  listenerPort?: number;
}

interface CertBundleConfig {
  endpoint_address?: string;
  endpoint?: string;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/^https?:\/\//i, '');
}

function readBundleConfig(configPath: string): CertBundleConfig {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as CertBundleConfig;
}

/**
 * Minimal edge-device simulator used in integration tests.
 * It validates mTLS credentials by opening a TLS connection to IoT endpoint,
 * and exposes a local HTTP listener for simple edge health checks.
 */
export class EdgeIotDevice {
  private readonly thingName: string;
  private readonly endpoint: string;
  private readonly certificatePath: string;
  private readonly privateKeyPath: string;
  private readonly rootCaPath?: string;
  private readonly clientId: string;
  private readonly listenerHost: string;
  private readonly listenerPort: number;

  private tlsSocket?: tls.TLSSocket;
  private healthServer?: http.Server;
  private registered = false;
  private poweredOn = false;
  private connected = false;

  constructor(options: EdgeIotDeviceOptions) {
    this.thingName = options.thingName;
    this.endpoint = normalizeEndpoint(options.endpoint);
    this.certificatePath = options.certificatePath;
    this.privateKeyPath = options.privateKeyPath;
    this.rootCaPath = options.rootCaPath;
    this.clientId = options.clientId || `${this.thingName}-${Date.now()}`;
    this.listenerHost = options.listenerHost || '127.0.0.1';
    this.listenerPort = options.listenerPort || 0;
  }

  static fromCertBundleDir(
    thingName: string,
    certsRootDir: string,
    endpointOverride?: string,
    topicNamespace = 'gym'
  ): EdgeIotDevice {
    const thingDir = path.join(certsRootDir, thingName);
    const certificatePath = path.join(thingDir, 'certificate.pem.crt');
    const privateKeyPath = path.join(thingDir, 'private.pem.key');
    const rootCaPath = path.join(thingDir, 'AmazonRootCA1.pem');
    const config = readBundleConfig(path.join(thingDir, 'config.json'));
    const endpoint = endpointOverride || config.endpoint_address || config.endpoint;

    if (!endpoint) {
      throw new Error(`Unable to resolve IoT endpoint for ${thingName} from cert bundle config`);
    }
    if (!fs.existsSync(certificatePath) || !fs.existsSync(privateKeyPath)) {
      throw new Error(`Missing certificate or private key for ${thingName} in ${thingDir}`);
    }

    return new EdgeIotDevice({
      thingName,
      endpoint,
      certificatePath,
      privateKeyPath,
      rootCaPath,
      topicNamespace,
    });
  }

  private readCredentials(): { cert: string; key: string; ca?: string } {
    if (!fs.existsSync(this.certificatePath) || !fs.existsSync(this.privateKeyPath)) {
      throw new Error(`Missing certificate or private key for ${this.thingName}`);
    }

    return {
      cert: fs.readFileSync(this.certificatePath, 'utf8'),
      key: fs.readFileSync(this.privateKeyPath, 'utf8'),
      ca: this.rootCaPath && fs.existsSync(this.rootCaPath) ? fs.readFileSync(this.rootCaPath, 'utf8') : undefined,
    };
  }

  private async connectToIotWithMtls(): Promise<void> {
    if (this.connected) {
      return;
    }

    const { cert, key, ca } = this.readCredentials();

    await new Promise<void>((resolve, reject) => {
      const socket = tls.connect({
        host: this.endpoint,
        port: 8883,
        servername: this.endpoint,
        cert,
        key,
        ca,
        rejectUnauthorized: true,
      });

      const onError = (error: Error): void => {
        socket.destroy();
        reject(new Error(`Failed to connect to IoT endpoint ${this.endpoint}: ${error.message}`));
      };

      socket.once('error', onError);
      socket.once('secureConnect', () => {
        socket.off('error', onError);
        this.tlsSocket = socket;
        this.connected = true;
        resolve();
      });
    });
  }

  private async disconnectFromIot(): Promise<void> {
    if (!this.tlsSocket) {
      this.connected = false;
      return;
    }

    await new Promise<void>((resolve) => {
      const socket = this.tlsSocket;
      this.tlsSocket = undefined;
      this.connected = false;
      if (!socket) {
        throw new Error('TLS socket was not initialized');
      }
      socket.once('close', () => resolve());
      socket.end();
    });
  }

  private async startHealthListener(): Promise<void> {
    if (this.healthServer?.listening) {
      return;
    }

    this.healthServer = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        const payload = {
          thingName: this.thingName,
          clientId: this.clientId,
          registered: this.registered,
          poweredOn: this.poweredOn,
          connected: this.connected,
          timestamp: new Date().toISOString(),
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.healthServer;
      if (!server) {
        reject(new Error('Health server was not created'));
        return;
      }

      server.once('error', reject);
      server.listen(this.listenerPort, this.listenerHost, () => {
        server.off('error', reject);
        resolve();
      });
    });
  }

  private async stopHealthListener(): Promise<void> {
    if (!this.healthServer?.listening) {
      return;
    }

    const server = this.healthServer;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.healthServer = undefined;
  }

  async register(): Promise<void> {
    await this.connectToIotWithMtls();
    this.registered = true;
  }

  async unregister(): Promise<void> {
    await this.off();
    await this.disconnectFromIot();
    this.registered = false;
    this.connected = false;
  }

  async publishHeartbeat(): Promise<void> {
    const client = new IoTDataPlaneClient({
      endpoint: `https://${this.endpoint}`,
      region: process.env.AWS_REGION || 'eu-central-1',
    });

    await client.send(
      new PublishCommand({
        topic: `gym/devices/${this.thingName}/heartbeat`,
        qos: 1,
        payload: Buffer.from(
          JSON.stringify({
            thingName: this.thingName,
            status: 'online',
            timestamp: new Date().toISOString(),
          })
        ),
      })
    );
  }

  async on(): Promise<void> {
    if (!this.registered) {
      throw new Error('Device must be registered before turning on');
    }

    await this.connectToIotWithMtls();
    await this.startHealthListener();
    await this.publishHeartbeat();
    this.poweredOn = true;
    this.connected = true;
  }

  async off(): Promise<void> {
    this.poweredOn = false;
    await this.stopHealthListener();
    await this.disconnectFromIot();
    this.connected = false;
  }

  probe(): EdgeDeviceState {
    return {
      registered: this.registered,
      poweredOn: this.poweredOn,
      connected: this.connected,
    };
  }
}
