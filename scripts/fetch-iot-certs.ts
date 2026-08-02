import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as fs from 'fs';
import * as path from 'path';

async function fetchCerts() {
  const secretName = process.env.SECRET_NAME || 'hd360-qr-scanner/certs';
  const outputDir = process.argv[2] || path.join(process.cwd(), 'certs');

  console.log(`[IoT Cert Fetcher] Fetching secret "${secretName}"...`);
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'eu-central-1',
  });

  try {
    const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
    if (!res.SecretString) {
      throw new Error('Secret value is empty');
    }

    const payload = JSON.parse(res.SecretString);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(path.join(outputDir, 'certificate.pem.crt'), payload.certificate_pem);
    fs.writeFileSync(path.join(outputDir, 'private.pem.key'), payload.private_key);
    fs.writeFileSync(path.join(outputDir, 'amazon-root-ca1.pem'), payload.root_ca);
    fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify({
      endpoint: payload.endpoint_address,
      certificate_arn: payload.certificate_arn,
      certificate_id: payload.certificate_id,
    }, null, 2));

    console.log(`[IoT Cert Fetcher] Certificates saved successfully to: ${outputDir}`);
    console.log(`- Certificate: ${path.join(outputDir, 'certificate.pem.crt')}`);
    console.log(`- Private Key: ${path.join(outputDir, 'private.pem.key')}`);
    console.log(`- Amazon Root CA: ${path.join(outputDir, 'amazon-root-ca1.pem')}`);
    console.log(`- Config: ${path.join(outputDir, 'config.json')}`);
  } catch (err: any) {
    console.error(`[IoT Cert Fetcher] Error fetching certificates:`, err.message);
    process.exit(1);
  }
}

fetchCerts();
