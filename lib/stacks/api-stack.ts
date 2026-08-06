import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';

import { Construct } from 'constructs';
import * as path from 'path';
import { CrossboxDataStack } from './data-stack';

export interface CrossboxApiStackProps extends cdk.StackProps {
  isTest: boolean;
  dataStack: CrossboxDataStack;
  appDistributionDomainName?: string;
  partnerBusName?: string;
}

export class CrossboxApiStack extends cdk.Stack {
  public readonly httpApi: apigw.HttpApi;
  public readonly stripeEventBus: events.IEventBus;
  public readonly verifyEntryFunction: nodejs.NodejsFunction;
  public readonly deviceHeartbeatFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: CrossboxApiStackProps) {
    super(scope, id, props);

    const { isTest, dataStack, appDistributionDomainName, partnerBusName } = props;
    const { mainTable, entryLogsTable, auditLogsTable, devicePresenceTable, userPool, userPoolClient } = dataStack;

    // --- 1. API Gateway (HTTP) ---
    this.httpApi = new apigw.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.PUT,
          apigw.CorsHttpMethod.DELETE,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['*'],
        maxAge: cdk.Duration.hours(24),
      },
    });

    const jwtAuthorizer = new HttpJwtAuthorizer('CognitoAuthorizer', userPool.userPoolProviderUrl, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });

    // Policy to allow Lambda to read Stripe secret from SSM Parameter Store (if defined)
    const ssmPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/crossbox/stripe/*`],
    });

    const commonEnv = {
      MAIN_TABLE_NAME: mainTable.tableName,
      ENTRY_LOGS_TABLE_NAME: entryLogsTable.tableName,
      AUDIT_LOGS_TABLE_NAME: auditLogsTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      FRONTEND_URL: appDistributionDomainName ? `https://${appDistributionDomainName}` : 'http://localhost:3000',
      PAYMENT_PROVIDER: isTest ? 'mock' : 'stripe',
      IDENTITY_PROVIDER: isTest ? 'mock' : 'cognito',
    };

    const defaultNodejsFunctionProps: Partial<nodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    };

    const handlersPath = path.join(__dirname, '..', 'handlers');

    // AuthHandler
    const authHandler = new nodejs.NodejsFunction(this, 'AuthHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'auth', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      environment: {
        ...commonEnv,
      },
    });
    mainTable.grantReadWriteData(authHandler);
    authHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminInitiateAuth',
          'cognito-idp:AdminResetUserPassword',
        ],
        resources: [userPool.userPoolArn],
      })
    );
    const authIntegration = new HttpLambdaIntegration('AuthIntegration', authHandler);

    this.httpApi.addRoutes({ path: '/auth/register', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    this.httpApi.addRoutes({ path: '/auth/login', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    this.httpApi.addRoutes({
      path: '/auth/forgot-password',
      methods: [apigw.HttpMethod.POST],
      integration: authIntegration,
    });
    this.httpApi.addRoutes({
      path: '/auth/confirm-forgot-password',
      methods: [apigw.HttpMethod.POST],
      integration: authIntegration,
    });
    this.httpApi.addRoutes({
      path: '/auth/set-password',
      methods: [apigw.HttpMethod.POST],
      integration: authIntegration,
      authorizer: jwtAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/auth/magic-link',
      methods: [apigw.HttpMethod.POST],
      integration: authIntegration,
    });
    this.httpApi.addRoutes({
      path: '/auth/magic-link/verify',
      methods: [apigw.HttpMethod.GET],
      integration: authIntegration,
    });

    // CheckoutHandler
    const checkoutHandler = new nodejs.NodejsFunction(this, 'CheckoutHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'checkout', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
      },
    });
    mainTable.grantReadData(checkoutHandler);
    if (!isTest) {
      checkoutHandler.addToRolePolicy(ssmPolicy);
    }
    const checkoutIntegration = new HttpLambdaIntegration('CheckoutIntegration', checkoutHandler);
    this.httpApi.addRoutes({
      path: '/checkout/session',
      methods: [apigw.HttpMethod.POST],
      integration: checkoutIntegration,
    });

    // StripeWebhookHandler
    const stripeWebhookHandler = new nodejs.NodejsFunction(this, 'StripeWebhookHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'stripe-webhook', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
      },
    });
    mainTable.grantReadWriteData(stripeWebhookHandler);
    stripeWebhookHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminResetUserPassword'],
        resources: [userPool.userPoolArn],
      })
    );
    if (!isTest) {
      stripeWebhookHandler.addToRolePolicy(ssmPolicy);
    }

    // EventBridge Bus & Rule for Stripe Events
    this.stripeEventBus = partnerBusName
      ? events.EventBus.fromEventBusName(this, 'StripeEventBus', partnerBusName)
      : new events.EventBus(this, 'StripeEventBus', {
          eventBusName: isTest ? `${this.stackName}-StripeBus` : 'stripe-events-bus',
        });

    const stripeEventRule = new events.Rule(this, 'StripeEventRule', {
      eventBus: this.stripeEventBus,
      eventPattern: {
        detailType: [
          'checkout.session.completed',
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'invoice.paid',
          'invoice.payment_failed',
        ],
      },
    });
    stripeEventRule.addTarget(new targets.LambdaFunction(stripeWebhookHandler));

    // MemberHandler
    const memberHandler = new nodejs.NodejsFunction(this, 'MemberHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'member', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
      },
    });
    mainTable.grantReadWriteData(memberHandler);
    memberHandler.addToRolePolicy(ssmPolicy);

    const memberIntegration = new HttpLambdaIntegration('MemberIntegration', memberHandler);

    this.httpApi.addRoutes({
      path: '/member/dashboard',
      methods: [apigw.HttpMethod.GET],
      integration: memberIntegration,
      authorizer: jwtAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/member/consent',
      methods: [apigw.HttpMethod.POST],
      integration: memberIntegration,
      authorizer: jwtAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/member/qr',
      methods: [apigw.HttpMethod.POST],
      integration: memberIntegration,
      authorizer: jwtAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/member/portal-session',
      methods: [apigw.HttpMethod.POST],
      integration: memberIntegration,
      authorizer: jwtAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/member/invoices',
      methods: [apigw.HttpMethod.GET],
      integration: memberIntegration,
      authorizer: jwtAuthorizer,
    });

    // VerifyEntry
    this.verifyEntryFunction = new nodejs.NodejsFunction(this, 'VerifyEntry', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'verify-entry', 'index.ts'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ...commonEnv,
        ENTRY_LOGS_TABLE_NAME: entryLogsTable.tableName,
        LOCKER_CLIENT_TYPE: isTest ? 'mock' : 'mqtt',
      },
    });
    mainTable.grantReadWriteData(this.verifyEntryFunction);
    entryLogsTable.grantReadWriteData(this.verifyEntryFunction);
    this.verifyEntryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iot:Publish', 'iot:DescribeEndpoint'],
        resources: ['*'],
      })
    );
    this.verifyEntryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/crossbox/iot/*`],
      })
    );

    // DeviceHeartbeatHandler
    this.deviceHeartbeatFunction = new nodejs.NodejsFunction(this, 'DeviceHeartbeatHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'device-heartbeat', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ...commonEnv,
        PRESENCE_TABLE_NAME: devicePresenceTable.tableName,
      },
    });
    devicePresenceTable.grantWriteData(this.deviceHeartbeatFunction);

    // AdminHandler
    const adminHandler = new nodejs.NodejsFunction(this, 'AdminHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'admin', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
        AUDIT_LOGS_TABLE_NAME: auditLogsTable.tableName,
        ENTRY_LOGS_TABLE_NAME: entryLogsTable.tableName,
        PRESENCE_TABLE_NAME: devicePresenceTable.tableName,
        DEVICE_OFFLINE_THRESHOLD_MS: '30000',
        LOCKER_CLIENT_TYPE: isTest ? 'mock' : 'mqtt',
      },
    });
    mainTable.grantReadWriteData(adminHandler);
    auditLogsTable.grantWriteData(adminHandler);
    entryLogsTable.grantReadData(adminHandler);
    devicePresenceTable.grantReadData(adminHandler);
    adminHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iot:Publish', 'iot:DescribeEndpoint'],
        resources: ['*'],
      })
    );
    adminHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/crossbox/iot/*`],
      })
    );

    const adminIntegration = new HttpLambdaIntegration('AdminIntegration', adminHandler);
    const adminRoutes = [
      { path: '/admin/locations', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/locations/{id}', methods: [apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE] },
      { path: '/admin/locations/{id}/activity', methods: [apigw.HttpMethod.GET] },
      { path: '/admin/locations/{id}/devices', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/devices/{id}', methods: [apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE] },
      { path: '/admin/members', methods: [apigw.HttpMethod.GET] },
      { path: '/admin/members/{id}', methods: [apigw.HttpMethod.GET] },
      { path: '/admin/members/{id}/override', methods: [apigw.HttpMethod.POST] },
      { path: '/admin/devices/{id}/unlock', methods: [apigw.HttpMethod.POST] },
      { path: '/admin/devices/{id}/health', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/hmac/rotate', methods: [apigw.HttpMethod.POST] },
    ];
    for (const route of adminRoutes) {
      this.httpApi.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: adminIntegration,
        authorizer: jwtAuthorizer,
      });
    }

    // GraceExpiryCron Lambda
    const graceExpiryHandler = new nodejs.NodejsFunction(this, 'GraceExpiryCron', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'grace-expiry-cron', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    mainTable.grantReadWriteData(graceExpiryHandler);

    new events.Rule(this, 'GraceExpiryCronSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new targets.LambdaFunction(graceExpiryHandler)],
    });

    // --- Stack Outputs ---
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'API Gateway HTTP API endpoint URL',
    });
    new cdk.CfnOutput(this, 'ApiId', { value: this.httpApi.httpApiId, description: 'API Gateway HTTP API ID' });
    new cdk.CfnOutput(this, 'StripeEventBusName', {
      value: this.stripeEventBus.eventBusName,
      description: 'EventBridge bus name for Stripe events',
    });
    new cdk.CfnOutput(this, 'StripeEventBusArn', {
      value: this.stripeEventBus.eventBusArn,
      description: 'EventBridge bus ARN for Stripe events',
    });
    new cdk.CfnOutput(this, 'StripeWebhookUrl', {
      value: `${this.httpApi.apiEndpoint}/stripe/webhook`,
      description: 'Stripe webhook endpoint URL',
    });
    new cdk.CfnOutput(this, 'AuthHandlerArn', {
      value: authHandler.functionArn,
      description: 'Auth Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'AuthHandlerName', {
      value: authHandler.functionName,
      description: 'Auth Lambda function name',
    });
    new cdk.CfnOutput(this, 'CheckoutHandlerArn', {
      value: checkoutHandler.functionArn,
      description: 'Checkout Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'CheckoutHandlerName', {
      value: checkoutHandler.functionName,
      description: 'Checkout Lambda function name',
    });
    new cdk.CfnOutput(this, 'StripeWebhookHandlerArn', {
      value: stripeWebhookHandler.functionArn,
      description: 'Stripe webhook Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'StripeWebhookHandlerName', {
      value: stripeWebhookHandler.functionName,
      description: 'Stripe webhook Lambda function name',
    });
    new cdk.CfnOutput(this, 'MemberHandlerArn', {
      value: memberHandler.functionArn,
      description: 'Member Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'MemberHandlerName', {
      value: memberHandler.functionName,
      description: 'Member Lambda function name',
    });
    new cdk.CfnOutput(this, 'AdminHandlerArn', {
      value: adminHandler.functionArn,
      description: 'Admin Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'AdminHandlerName', {
      value: adminHandler.functionName,
      description: 'Admin Lambda function name',
    });
    new cdk.CfnOutput(this, 'VerifyEntryFunctionArn', {
      value: this.verifyEntryFunction.functionArn,
      description: 'Verify entry Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'VerifyEntryFunctionName', {
      value: this.verifyEntryFunction.functionName,
      description: 'Verify entry Lambda function name',
    });
    new cdk.CfnOutput(this, 'DeviceHeartbeatFunctionArn', {
      value: this.deviceHeartbeatFunction.functionArn,
      description: 'Device heartbeat Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'DeviceHeartbeatFunctionName', {
      value: this.deviceHeartbeatFunction.functionName,
      description: 'Device heartbeat Lambda function name',
    });
    new cdk.CfnOutput(this, 'GraceExpiryHandlerArn', {
      value: graceExpiryHandler.functionArn,
      description: 'Grace expiry cron Lambda function ARN',
    });
    new cdk.CfnOutput(this, 'GraceExpiryHandlerName', {
      value: graceExpiryHandler.functionName,
      description: 'Grace expiry cron Lambda function name',
    });
  }
}
