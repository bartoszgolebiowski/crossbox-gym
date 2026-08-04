import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import {
  IotDevice,
  iotFleet,
  resolveDeviceTopic,
  SSM_IOT_ENDPOINT_PARAM,
  SSM_LOCKER_THING_NAME_PARAM,
} from '../config';
import { CrossboxApiStack } from './api-stack';

export interface CrossboxIotStackProps extends cdk.StackProps {
  isTest: boolean;
  apiStack: CrossboxApiStack;
}

interface ThingEntry {
  device: IotDevice;
  thing: iot.CfnThing;
}

export class CrossboxIotStack extends cdk.Stack {
  public readonly certSecret: secretsmanager.Secret;
  public readonly iotThing: iot.CfnThing;
  public readonly lockerThing: iot.CfnThing;
  public readonly iotPolicy: iot.CfnPolicy;
  public readonly topicRule: iot.CfnTopicRule;

  constructor(scope: Construct, id: string, props: CrossboxIotStackProps) {
    super(scope, id, props);

    const { apiStack } = props;
    const fleet = iotFleet;

    // Context overrides allow ad-hoc deploy-time customization without editing JSON.
    const policyName = this.node.tryGetContext('policy_name') || fleet.policyName;
    const secretName = this.node.tryGetContext('secret_name') || fleet.secretName;

    // 1. Create an AWS IoT Thing for every device in the fleet config.
    const things: ThingEntry[] = fleet.devices.map((device) => {
      const thing = new iot.CfnThing(this, `${this._pascalCase(device.id)}Thing`, {
        thingName: device.thingName,
        attributePayload: {
          attributes: {
            device_type: device.deviceType,
            ...device.attributes,
          },
        },
      });
      return { device, thing };
    });

    // Keep named references for consumers that expect them.
    const scannerEntry = things.find((t) => t.device.type === 'scanner');
    const lockerEntry = things.find((t) => t.device.type === 'locker');

    if (!scannerEntry) {
      throw new Error('No scanner device configured in IoT fleet');
    }
    if (!lockerEntry) {
      throw new Error('No locker device configured in IoT fleet');
    }

    this.iotThing = scannerEntry.thing;
    this.lockerThing = lockerEntry.thing;

    const thingNames = things.map((t) => t.device.thingName);

    // 2. Build AWS IoT Policy from fleet topics.
    const publishTopics = new Set<string>();
    const subscribeTopics = new Set<string>();
    const receiveTopics = new Set<string>();

    for (const { device } of things) {
      if (device.topics.scan) {
        publishTopics.add(resolveDeviceTopic(device, 'scan').replace(device.thingName, '*'));
      }
      if (device.topics.feedback) {
        const topic = resolveDeviceTopic(device, 'feedback').replace(device.thingName, '*');
        subscribeTopics.add(`topicfilter/${topic}`);
        receiveTopics.add(topic);
      }
      if (device.topics.command) {
        const topic = resolveDeviceTopic(device, 'command').replace(device.thingName, '*');
        subscribeTopics.add(`topicfilter/${topic}`);
        receiveTopics.add(topic);
      }
    }

    const iotPolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['iot:Connect'],
          Resource: [
            ...thingNames.map((name) => `arn:aws:iot:${this.region}:${this.account}:client/${name}`),
            `arn:aws:iot:${this.region}:${this.account}:client/*`,
          ],
        },
        {
          Effect: 'Allow',
          Action: ['iot:Publish'],
          Resource: Array.from(publishTopics).map(
            (topic) => `arn:aws:iot:${this.region}:${this.account}:topic/${topic}`
          ),
        },
        {
          Effect: 'Allow',
          Action: ['iot:Subscribe'],
          Resource: Array.from(subscribeTopics).map((topic) => `arn:aws:iot:${this.region}:${this.account}:${topic}`),
        },
        {
          Effect: 'Allow',
          Action: ['iot:Receive'],
          Resource: Array.from(receiveTopics).map(
            (topic) => `arn:aws:iot:${this.region}:${this.account}:topic/${topic}`
          ),
        },
      ],
    };

    this.iotPolicy = new iot.CfnPolicy(this, 'CrossboxIotPolicy', {
      policyName,
      policyDocument: iotPolicyDocument,
    });

    // 3. Secrets Manager Secret for storing X.509 Certs & Keys.
    this.certSecret = new secretsmanager.Secret(this, 'CrossboxIotCertSecret', {
      secretName,
      description: `mTLS X.509 Device Certificates for Crossbox Gym IoT fleet: ${thingNames.join(', ')}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 4. Lambda Custom Resource to generate per-device IoT Certs & store in Secrets Manager.
    const certProvisionerLambda = new lambda.Function(this, 'CertProvisionerHandler', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.on_event',
      code: lambda.Code.fromInline(this._getLambdaCode()),
      description: 'Custom Resource Lambda generating AWS IoT Keys/Certs per device and storing in Secrets Manager',
      timeout: cdk.Duration.seconds(120),
    });

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

    this.certSecret.grantRead(certProvisionerLambda);
    this.certSecret.grantWrite(certProvisionerLambda);

    const certProvider = new cr.Provider(this, 'CertProvisionerProvider', {
      onEventHandler: certProvisionerLambda,
    });

    const customResource = new cdk.CustomResource(this, 'CertProvisionerResource', {
      serviceToken: certProvider.serviceToken,
      properties: {
        ThingNames: thingNames,
        PolicyName: policyName,
        SecretArn: this.certSecret.secretArn,
      },
    });

    customResource.node.addDependency(this.iotPolicy);
    for (const { thing } of things) {
      customResource.node.addDependency(thing);
    }

    // 5. AWS IoT Topic Rule to invoke VerifyEntry Lambda on incoming scans.
    const verifyEntryFunc = apiStack.verifyEntryFunction;

    this.topicRule = new iot.CfnTopicRule(this, `${this._pascalCase(fleet.scannerTopicRule.name)}`, {
      ruleName: fleet.scannerTopicRule.name,
      topicRulePayload: {
        sql: fleet.scannerTopicRule.sql,
        description: 'Forwards MQTT scan events from QR scanners to VerifyEntry Lambda',
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

    verifyEntryFunc.addPermission('IoTInvokePermission', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/${fleet.scannerTopicRule.name}`,
    });

    // 6. SSM Parameter Store parameters declared by the fleet config.
    new ssm.StringParameter(this, 'IotEndpointParameter', {
      parameterName: SSM_IOT_ENDPOINT_PARAM,
      stringValue: customResource.getAttString('IotEndpoint'),
      description: 'AWS IoT Core ATS Data Endpoint URL for Crossbox Gym',
    });

    for (const { device } of things) {
      if (device.ssm?.thingNameParameter) {
        new ssm.StringParameter(this, `${this._pascalCase(device.id)}ThingNameParameter`, {
          parameterName: SSM_LOCKER_THING_NAME_PARAM,
          stringValue: device.thingName,
          description: `AWS IoT Thing Name for ${device.deviceType}`,
        });
      }
    }

    // 7. Stack Outputs driven by fleet config.
    new cdk.CfnOutput(this, 'SecretNameOutput', {
      value: secretName,
      description: 'AWS Secrets Manager Secret Name for fetching certificates',
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

    for (const { device } of things) {
      for (const [outputKey, outputName] of Object.entries(device.outputs)) {
        let value: string;
        switch (outputKey) {
          case 'thingName':
            value = device.thingName;
            break;
          case 'scanTopic':
            value = resolveDeviceTopic(device, 'scan');
            break;
          case 'feedbackTopic':
            value = resolveDeviceTopic(device, 'feedback');
            break;
          case 'commandTopic':
            value = resolveDeviceTopic(device, 'command');
            break;
          case 'certPath':
            value = `certs/${device.thingName}/`;
            break;
          default:
            value = '';
        }
        new cdk.CfnOutput(this, outputName, {
          value,
          description: `Crossbox IoT ${device.id} ${outputKey}`,
        });
      }
    }
  }

  private _pascalCase(value: string): string {
    return value.replace(/(?:^|-)([a-z])/g, (_, letter) => letter.toUpperCase());
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


def load_existing_certs(secret_arn, thing_names):
    try:
        val = secretsmanager.get_secret_value(SecretId=secret_arn)
        payload = json.loads(val.get('SecretString', '{}'))
    except Exception:
        return {}

    if not payload or not isinstance(payload, dict):
        return {}

    # New per-device map format: { thingName: { certificate_pem, ... } }
    if 'certificate_pem' not in payload:
        return payload

    # Legacy flat format: convert using the first configured thing name.
    if thing_names:
        return {thing_names[0]: payload}

    return {}


def create_cert_for_thing(thing_name, policy_name, endpoint_url, root_ca):
    cert_resp = iot.create_keys_and_certificate(setAsActive=True)
    cert_arn = cert_resp['certificateArn']
    cert_id = cert_resp['certificateId']
    cert_pem = cert_resp['certificatePem']
    private_key = cert_resp['keyPair']['PrivateKey']

    iot.attach_policy(policyName=policy_name, target=cert_arn)
    iot.attach_thing_principal(thingName=thing_name, principal=cert_arn)

    return {
        'certificate_pem': cert_pem,
        'private_key': private_key,
        'root_ca': root_ca,
        'certificate_arn': cert_arn,
        'certificate_id': cert_id,
        'endpoint_address': endpoint_url
    }, cert_id


def on_event(event, context):
    request_type = event['RequestType']
    props = event['ResourceProperties']
    thing_names = props['ThingNames']
    policy_name = props['PolicyName']
    secret_arn = props['SecretArn']

    if request_type == 'Create':
        ep_resp = iot.describe_endpoint(endpointType='iot:Data-ATS')
        endpoint_url = ep_resp.get('endpointAddress')
        root_ca = fetch_amazon_root_ca()

        certs = {}
        cert_ids = []
        for thing_name in thing_names:
            cert_data, cert_id = create_cert_for_thing(thing_name, policy_name, endpoint_url, root_ca)
            certs[thing_name] = cert_data
            cert_ids.append(cert_id)

        secretsmanager.put_secret_value(
            SecretId=secret_arn,
            SecretString=json.dumps(certs)
        )

        return {
            'PhysicalResourceId': ','.join(cert_ids),
            'Data': {
                'IotEndpoint': endpoint_url
            }
        }

    elif request_type == 'Update':
        physical_id = event['PhysicalResourceId']
        ep_resp = iot.describe_endpoint(endpointType='iot:Data-ATS')
        endpoint_url = ep_resp.get('endpointAddress')
        root_ca = fetch_amazon_root_ca()

        certs = load_existing_certs(secret_arn, thing_names)
        new_cert_ids = []
        for thing_name in thing_names:
            if thing_name not in certs:
                cert_data, cert_id = create_cert_for_thing(thing_name, policy_name, endpoint_url, root_ca)
                certs[thing_name] = cert_data
                new_cert_ids.append(cert_id)

        if new_cert_ids:
            secretsmanager.put_secret_value(
                SecretId=secret_arn,
                SecretString=json.dumps(certs)
            )
            physical_id = f"{physical_id},{','.join(new_cert_ids)}"

        return {
            'PhysicalResourceId': physical_id,
            'Data': {
                'IotEndpoint': endpoint_url
            }
        }

    elif request_type == 'Delete':
        physical_id = event.get('PhysicalResourceId')
        policy_name = props['PolicyName']
        thing_names = props.get('ThingNames', [])
        if physical_id:
            region = boto3.session.Session().region_name
            account = boto3.client('sts').get_caller_identity()['Account']
            cert_ids = physical_id.split(',')
            for cert_id in cert_ids:
                try:
                    cert_arn = f"arn:aws:iot:{region}:{account}:cert/{cert_id}"
                    try:
                        iot.detach_policy(policyName=policy_name, target=cert_arn)
                    except Exception:
                        pass
                    for thing_name in thing_names:
                        try:
                            iot.detach_thing_principal(thingName=thing_name, principal=cert_arn)
                        except Exception:
                            pass
                    try:
                        iot.update_certificate(certificateId=cert_id, newStatus='INACTIVE')
                        iot.delete_certificate(certificateId=cert_id, forceDelete=True)
                    except Exception:
                        pass
                except Exception as e:
                    print(f"Error during cert cleanup for {cert_id}: {e}")

        return {'PhysicalResourceId': physical_id}
`;
  }
}
