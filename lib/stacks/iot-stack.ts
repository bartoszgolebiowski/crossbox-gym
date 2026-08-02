import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { CrossboxApiStack } from './api-stack';

export interface CrossboxIotStackProps extends cdk.StackProps {
  isTest: boolean;
  apiStack: CrossboxApiStack;
}

export class CrossboxIotStack extends cdk.Stack {
  public readonly certSecret: secretsmanager.Secret;
  public readonly iotThing: iot.CfnThing;
  public readonly iotPolicy: iot.CfnPolicy;
  public readonly topicRule: iot.CfnTopicRule;

  constructor(scope: Construct, id: string, props: CrossboxIotStackProps) {
    super(scope, id, props);

    const { isTest, apiStack } = props;

    const thingName = this.node.tryGetContext('thing_name') || 'hd360-qr-scanner-01';
    const policyName = this.node.tryGetContext('policy_name') || 'hd360-qr-scanner-policy';
    const secretName = this.node.tryGetContext('secret_name') || 'hd360-qr-scanner/certs';

    // 1. Create AWS IoT Thing
    this.iotThing = new iot.CfnThing(this, 'QrScannerThing', {
      thingName,
      attributePayload: {
        attributes: {
          device_type: 'HDWR-HD360-QR-Scanner',
          version: '1.0.0',
        },
      },
    });

    // 2. Create AWS IoT Policy
    const iotPolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['iot:Connect'],
          Resource: [`arn:aws:iot:${this.region}:${this.account}:client/${thingName}`],
        },
        {
          Effect: 'Allow',
          Action: ['iot:Publish'],
          Resource: [`arn:aws:iot:${this.region}:${this.account}:topic/gym/scanners/*/scan`],
        },
        {
          Effect: 'Allow',
          Action: ['iot:Subscribe'],
          Resource: [`arn:aws:iot:${this.region}:${this.account}:topicfilter/gym/scanners/*/feedback`],
        },
        {
          Effect: 'Allow',
          Action: ['iot:Receive'],
          Resource: [`arn:aws:iot:${this.region}:${this.account}:topic/gym/scanners/*/feedback`],
        },
      ],
    };

    this.iotPolicy = new iot.CfnPolicy(this, 'QrScannerPolicy', {
      policyName,
      policyDocument: iotPolicyDocument,
    });

    // 3. Secrets Manager Secret for storing X.509 Certs & Keys
    this.certSecret = new secretsmanager.Secret(this, 'QrScannerCertSecret', {
      secretName,
      description: 'mTLS X.509 Device Certificate & Private Key for HDWR HD360 QR Scanner',
      removalPolicy: isTest ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });

    // 4. Lambda Custom Resource to generate IoT Certs & store in Secrets Manager
    const certProvisionerLambda = new lambda.Function(this, 'CertProvisionerHandler', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.on_event',
      code: lambda.Code.fromInline(this._getLambdaCode()),
      description: 'Custom Resource Lambda generating AWS IoT Keys/Certs and storing in Secrets Manager',
      timeout: cdk.Duration.seconds(60),
    });

    // IAM permissions for Lambda
    certProvisionerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'iot:CreateKeysAndCertificate',
          'iot:UpdateCertificate',
          'iot:DeleteCertificate',
          'iot:AttachPolicy',
          'iot:DetachPolicy',
          'iot:AttachThingPrincipal',
          'iot:DetachThingPrincipal',
          'iot:DescribeEndpoint',
        ],
        resources: ['*'],
      })
    );

    this.certSecret.grantWrite(certProvisionerLambda);

    const certProvider = new cr.Provider(this, 'CertProvisionerProvider', {
      onEventHandler: certProvisionerLambda,
    });

    const customResource = new cdk.CustomResource(this, 'CertProvisionerResource', {
      serviceToken: certProvider.serviceToken,
      properties: {
        ThingName: thingName,
        PolicyName: policyName,
        SecretArn: this.certSecret.secretArn,
      },
    });

    customResource.node.addDependency(this.iotThing);
    customResource.node.addDependency(this.iotPolicy);

    // 5. AWS IoT Topic Rule to invoke VerifyEntry Lambda on incoming scans
    const verifyEntryFunc = apiStack.verifyEntryFunction;

    this.topicRule = new iot.CfnTopicRule(this, 'QrScannerScanRule', {
      ruleName: 'QrScannerScanRule',
      topicRulePayload: {
        sql: "SELECT *, topic(3) as scannerId FROM 'gym/scanners/+/scan'",
        description: 'Forwards MQTT scan events from RPi QR scanner to VerifyEntry Lambda',
        actions: [
          {
            lambda: {
              functionArn: verifyEntryFunc.functionArn,
            },
          },
        ],
        ruleDisabled: false,
      },
    });

    // Grant IoT permission to invoke VerifyEntry Lambda
    verifyEntryFunc.addPermission('IoTInvokePermission', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/QrScannerScanRule`,
    });

    // Stack Outputs
    new cdk.CfnOutput(this, 'SecretNameOutput', {
      value: secretName,
      description: 'AWS Secrets Manager Secret Name for fetching certificates',
    });

    new cdk.CfnOutput(this, 'ThingNameOutput', {
      value: thingName,
      description: 'AWS IoT Thing Name',
    });

    new cdk.CfnOutput(this, 'IotEndpointOutput', {
      value: customResource.getAttString('IotEndpoint'),
      description: 'AWS IoT Core ATS Endpoint URL',
    });
  }

  private _getLambdaCode(): string {
    return `import json
import urllib.request
import boto3

iot = boto3.client('iot')
secretsmanager = boto3.client('secretsmanager')

def fetch_amazon_root_ca():
    url = "https://www.amazontrust.com/repository/AmazonRootCA1.pem"
    req = urllib.request.Request(url, headers={"User-Agent": "CDKCertProvisioner/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode("utf-8")

def on_event(event, context):
    request_type = event['RequestType']
    props = event['ResourceProperties']
    thing_name = props['ThingName']
    policy_name = props['PolicyName']
    secret_arn = props['SecretArn']

    if request_type == 'Create':
        ep_resp = iot.describe_endpoint(endpointType='iot:Data-ATS')
        endpoint_url = ep_resp.get('endpointAddress')

        cert_resp = iot.create_keys_and_certificate(setAsActive=True)
        cert_arn = cert_resp['certificateArn']
        cert_id = cert_resp['certificateId']
        cert_pem = cert_resp['certificatePem']
        private_key = cert_resp['keyPair']['PrivateKey']
        root_ca = fetch_amazon_root_ca()

        iot.attach_policy(policyName=policy_name, target=cert_arn)
        iot.attach_thing_principal(thingName=thing_name, principal=cert_arn)

        secret_payload = {
            "certificate_pem": cert_pem,
            "private_key": private_key,
            "root_ca": root_ca,
            "certificate_arn": cert_arn,
            "certificate_id": cert_id,
            "endpoint_address": endpoint_url
        }
        secretsmanager.put_secret_value(
            SecretId=secret_arn,
            SecretString=json.dumps(secret_payload)
        )

        return {
            'PhysicalResourceId': cert_id,
            'Data': {
                'CertificateArn': cert_arn,
                'CertificateId': cert_id,
                'IotEndpoint': endpoint_url
            }
        }

    elif request_type == 'Update':
        physical_id = event['PhysicalResourceId']
        ep_resp = iot.describe_endpoint(endpointType='iot:Data-ATS')
        return {
            'PhysicalResourceId': physical_id,
            'Data': {
                'IotEndpoint': ep_resp.get('endpointAddress')
            }
        }

    elif request_type == 'Delete':
        physical_id = event.get('PhysicalResourceId')
        if physical_id:
            try:
                cert_arn = f"arn:aws:iot:{boto3.session.Session().region_name}:{boto3.client('sts').get_caller_identity()['Account']}:cert/{physical_id}"
                try:
                    iot.detach_policy(policyName=policy_name, target=cert_arn)
                except Exception:
                    pass
                try:
                    iot.detach_thing_principal(thingName=thing_name, principal=cert_arn)
                except Exception:
                    pass
                try:
                    iot.update_certificate(certificateId=physical_id, newStatus='INACTIVE')
                    iot.delete_certificate(certificateId=physical_id, forceDelete=True)
                except Exception:
                    pass
            except Exception as e:
                print(f"Error during cert cleanup: {e}")

        return {'PhysicalResourceId': physical_id}
`;
  }
}
