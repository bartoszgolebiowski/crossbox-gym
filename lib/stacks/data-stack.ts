import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface CrossboxDataStackProps extends cdk.StackProps {
  isTest: boolean;
}

export class CrossboxDataStack extends cdk.Stack {
  public readonly mainTable: dynamodb.Table;
  public readonly entryLogsTable: dynamodb.Table;
  public readonly auditLogsTable: dynamodb.Table;
  public readonly devicePresenceTable: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly customMessageHandler: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: CrossboxDataStackProps) {
    super(scope, id, props);

    const isTest = props.isTest;
    const removalPolicy = isTest ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN;

    // --- 1. DynamoDB Tables ---
    this.mainTable = new dynamodb.Table(this, 'MainTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
    });

    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'EmailIndex',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'CognitoSubIndex',
      partitionKey: { name: 'cognito_sub', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'StripeSubIndex',
      partitionKey: { name: 'stripe_subscription_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'DeviceIdIndex',
      partitionKey: { name: 'device_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'OutboxStatusIndex',
      partitionKey: { name: 'OutboxStatusPK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'OutboxStatusSK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.entryLogsTable = new dynamodb.Table(this, 'EntryLogs', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
    });

    this.entryLogsTable.addGlobalSecondaryIndex({
      indexName: 'AntiPassbackIndex',
      partitionKey: { name: 'AntiPassbackPK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.entryLogsTable.addGlobalSecondaryIndex({
      indexName: 'LocationIndex',
      partitionKey: { name: 'location_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.auditLogsTable = new dynamodb.Table(this, 'AuditLogs', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    this.devicePresenceTable = new dynamodb.Table(this, 'DevicePresence', {
      partitionKey: { name: 'thingName', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
    });

    // Tag tables for discovery by the external backup/ app; DevicePresence is ephemeral and intentionally excluded.
    if (!isTest) {
      const tagTableForBackup = (table: dynamodb.Table, logicalName: string) => {
        cdk.Tags.of(table).add('crossbox-gym-backup', 'true');
        cdk.Tags.of(table).add('crossbox-gym-table', logicalName);
        cdk.Tags.of(table).add('crossbox-gym-project', 'crossbox-gym');
      };

      tagTableForBackup(this.mainTable, 'MainTable');
      tagTableForBackup(this.entryLogsTable, 'EntryLogs');
      tagTableForBackup(this.auditLogsTable, 'AuditLogs');
    }

    // --- 2. Cognito User Pool & Client ---
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      mfa: cognito.Mfa.OFF,
      customAttributes: {
        role: new cognito.StringAttribute({ mutable: true }),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy,
    });

    this.customMessageHandler = new nodejs.NodejsFunction(this, 'CustomMessageHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '..', 'handlers', 'custom-message', 'index.ts'),
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    this.userPool.addTrigger(cognito.UserPoolOperation.CUSTOM_MESSAGE, this.customMessageHandler);

    new cognito.CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admins',
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // --- Stack Outputs ---
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId, description: 'Cognito User Pool ID' });
    new cdk.CfnOutput(this, 'UserPoolArn', { value: this.userPool.userPoolArn, description: 'Cognito User Pool ARN' });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });
    new cdk.CfnOutput(this, 'UserPoolProviderUrl', {
      value: this.userPool.userPoolProviderUrl,
      description: 'Cognito User Pool OIDC Provider URL',
    });
    new cdk.CfnOutput(this, 'MainTableName', {
      value: this.mainTable.tableName,
      description: 'Main DynamoDB table name',
    });
    new cdk.CfnOutput(this, 'MainTableArn', { value: this.mainTable.tableArn, description: 'Main DynamoDB table ARN' });
    new cdk.CfnOutput(this, 'EntryLogsTableName', {
      value: this.entryLogsTable.tableName,
      description: 'Entry logs DynamoDB table name',
    });
    new cdk.CfnOutput(this, 'EntryLogsTableArn', {
      value: this.entryLogsTable.tableArn,
      description: 'Entry logs DynamoDB table ARN',
    });
    new cdk.CfnOutput(this, 'AuditLogsTableName', {
      value: this.auditLogsTable.tableName,
      description: 'Audit logs DynamoDB table name',
    });
    new cdk.CfnOutput(this, 'AuditLogsTableArn', {
      value: this.auditLogsTable.tableArn,
      description: 'Audit logs DynamoDB table ARN',
    });
    new cdk.CfnOutput(this, 'DevicePresenceTableName', {
      value: this.devicePresenceTable.tableName,
      description: 'Device presence DynamoDB table name',
    });
    new cdk.CfnOutput(this, 'DevicePresenceTableArn', {
      value: this.devicePresenceTable.tableArn,
      description: 'Device presence DynamoDB table ARN',
    });
    new cdk.CfnOutput(this, 'AdminsGroupName', {
      value: 'admins',
      description: 'Cognito user group name for administrators',
    });
    new cdk.CfnOutput(this, 'CustomMessageHandlerArn', {
      value: this.customMessageHandler.functionArn,
      description: 'Cognito custom message Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'CustomMessageHandlerName', {
      value: this.customMessageHandler.functionName,
      description: 'Cognito custom message Lambda function name',
    });
  }
}
