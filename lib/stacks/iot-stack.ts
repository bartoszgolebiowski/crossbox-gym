import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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
  public readonly lockerThing: iot.CfnThing;
  public readonly iotPolicy: iot.CfnPolicy;
  public readonly topicRule: iot.CfnTopicRule;

  constructor(scope: Construct, id: string, props: CrossboxIotStackProps) {
    super(scope, id, props);

    const { isTest, apiStack } = props;

    const thingName = this.node.tryGetContext('thing_name') || 'crossbox-qr-scanner-01';
    const lockThingName = this.node.tryGetContext('lock_thing_name') || 'crossbox-locker-relay-01';
    const policyName = this.node.tryGetContext('policy_name') || 'crossbox-gym-iot-policy';
    const secretName = this.node.tryGetContext('secret_name') || 'crossbox-gym/iot/certs';

    // 1a. Create AWS IoT Thing for QR Scanner
    this.iotThing = new iot.CfnThing(this, 'QrScannerThing', {
      thingName,
      attributePayload: {
        attributes: {
          device_type: 'HDWR-HD360-QR-Scanner',
          version: '1.0.0',
        },
      },
    });

    // 1b. Create AWS IoT Thing for Lock (Shelly Plus 1 Mini Gen3)
    this.lockerThing = new iot.CfnThing(this, 'LockerThing', {
      thingName: lockThingName,
      attributePayload: {
        attributes: {
          device_type: 'Shelly-Plus-1-Mini-Gen3',
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
          Resource: [
            `arn:aws:iot:${this.region}:${this.account}:client/${thingName}`,
            `arn:aws:iot:${this.region}:${this.account}:client/${lockThingName}`,
            `arn:aws:iot:${this.region}:${this.account}:client/*`,
          ],
        },
        {
          Effect: 'Allow',
          Action: ['iot:Publish'],
          Resource: [`arn:aws:iot:${this.region}:${this.account}:topic/gym/scanners/*/scan`],
        },
        {
          Effect: 'Allow',
          Action: ['iot:Subscribe'],
          Resource: [
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/gym/scanners/*/feedback`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/gym/lockers/*/command`,
          ],
        },
        {
          Effect: 'Allow',
          Action: ['iot:Receive'],
          Resource: [
            `arn:aws:iot:${this.region}:${this.account}:topic/gym/scanners/*/feedback`,
            `arn:aws:iot:${this.region}:${this.account}:topic/gym/lockers/*/command`,
          ],
        },
      ],
    };

    this.iotPolicy = new iot.CfnPolicy(this, 'CrossboxIotPolicy', {
      policyName,
      policyDocument: iotPolicyDocument,
    });

    // 3. Secrets Manager Secret for storing X.509 Certs & Keys
    this.certSecret = new secretsmanager.Secret(this, 'CrossboxIotCertSecret', {
      secretName,
      description:
        'mTLS X.509 Device Certificate & Private Key for Crossbox Gym IoT devices (QR Scanner and Shelly Lock Relay)',
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
    customResource.node.addDependency(this.lockerThing);
    customResource.node.addDependency(this.iotPolicy);

    // 5. AWS IoT Topic Rule to invoke VerifyEntry Lambda on incoming scans
    const verifyEntryFunc = apiStack.verifyEntryFunction;

    this.topicRule = new iot.CfnTopicRule(this, 'CrossboxQrScannerScanRule', {
      ruleName: 'CrossboxQrScannerScanRule',
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
      sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/CrossboxQrScannerScanRule`,
    });

    // SSM Parameter Store Parameters for runtime dynamic lookup
    new ssm.StringParameter(this, 'IotEndpointParameter', {
      parameterName: '/crossbox/iot/endpoint',
      stringValue: customResource.getAttString('IotEndpoint'),
      description: 'AWS IoT Core ATS Data Endpoint URL for Crossbox Gym',
    });

    new ssm.StringParameter(this, 'LockerThingNameParameter', {
      parameterName: '/crossbox/iot/locker-thing-name',
      stringValue: lockThingName,
      description: 'AWS IoT Locker Relay Thing Name for Crossbox Gym',
    });

    // Stack Outputs
    new cdk.CfnOutput(this, 'SecretNameOutput', {
      value: secretName,
      description: 'AWS Secrets Manager Secret Name for fetching certificates',
    });

    new cdk.CfnOutput(this, 'ThingNameOutput', {
      value: thingName,
      description: 'AWS IoT QR Scanner Thing Name',
    });

    new cdk.CfnOutput(this, 'LockerThingNameOutput', {
      value: lockThingName,
      description: 'AWS IoT Lock Thing Name (Shelly Plus 1 Mini Gen3)',
    });

    new cdk.CfnOutput(this, 'IotEndpointOutput', {
      value: customResource.getAttString('IotEndpoint'),
      description: 'AWS IoT Core ATS Endpoint URL',
    });

    new cdk.CfnOutput(this, 'IotEndpoint', {
      value: customResource.getAttString('IotEndpoint'),
      description: 'AWS IoT Core ATS Endpoint URL',
    });

    new cdk.CfnOutput(this, 'SecretName', {
      value: secretName,
      description: 'AWS Secrets Manager Secret Name for fetching certificates',
    });

    new cdk.CfnOutput(this, 'ScannerClientId', {
      value: thingName,
      description: 'AWS IoT QR Scanner Client ID / Thing Name',
    });

    new cdk.CfnOutput(this, 'LockerClientId', {
      value: lockThingName,
      description: 'AWS IoT Lock Relay Client ID / Thing Name',
    });

    new cdk.CfnOutput(this, 'ScannerScanTopic', {
      value: `gym/scanners/${thingName}/scan`,
      description: 'MQTT topic for QR scanner to publish scan payloads',
    });

    new cdk.CfnOutput(this, 'ScannerFeedbackTopic', {
      value: `gym/scanners/${thingName}/feedback`,
      description: 'MQTT topic for QR scanner to subscribe for access feedback',
    });

    new cdk.CfnOutput(this, 'LockerCommandTopic', {
      value: `gym/lockers/${lockThingName}/command`,
      description: 'MQTT topic for locker relay to subscribe for unlock commands',
    });

    new cdk.CfnOutput(this, 'ScannerCertPath', {
      value: `certs/${thingName}/`,
      description: 'Local directory path for fetched scanner certificates',
    });

    new cdk.CfnOutput(this, 'LockerCertPath', {
      value: `certs/${lockThingName}/`,
      description: 'Local directory path for fetched locker certificates',
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
