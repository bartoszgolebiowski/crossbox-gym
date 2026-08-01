import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';
import { CrossboxDataStack } from './data-stack';

export interface CrossboxApiStackProps extends cdk.StackProps {
  isTest: boolean;
  dataStack: CrossboxDataStack;
  appDistributionDomainName?: string;
}

export class CrossboxApiStack extends cdk.Stack {
  public readonly httpApi: apigw.HttpApi;
  public readonly stripeEventBus: events.IEventBus;
  public readonly unlockOutboxDispatcher: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: CrossboxApiStackProps) {
    super(scope, id, props);

    const { isTest, dataStack, appDistributionDomainName } = props;
    const { mainTable, entryLogsTable, auditLogsTable, unlockQueue, userPool, userPoolClient } = dataStack;

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

    // --- 2. Lambda Setup & Policies ---
    const stripeTestSecretKey = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
    const paymentProvider = (stripeTestSecretKey || !isTest) ? 'stripe' : 'mock';
    const lockProvider = isTest ? 'mock' : 'http';
    const contextFrontendUrl = this.node.tryGetContext('frontendUrl');
    const frontendUrl = (contextFrontendUrl && !contextFrontendUrl.includes('localhost')) 
      ? contextFrontendUrl 
      : (appDistributionDomainName ? `https://${appDistributionDomainName}` : 'http://localhost:5173');

    const commonEnv = {
      MAIN_TABLE_NAME: mainTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      PAYMENT_PROVIDER: paymentProvider,
      LOCK_PROVIDER: lockProvider,
      FRONTEND_URL: frontendUrl,
      STRIPE_TEST_SECRET_KEY: stripeTestSecretKey,
    };

    const defaultNodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    };

    const ssmPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'kms:Decrypt'],
      resources: [
        cdk.Arn.format({ service: 'ssm', resource: 'parameter', resourceName: 'crossbox/stripe/secret-key' }, this),
        cdk.Arn.format({ service: 'ssm', resource: 'parameter', resourceName: 'crossbox/stripe/webhook-secret' }, this)
      ],
    });

    const handlersPath = path.join(__dirname, '..', 'handlers');

    // AuthHandler
    const authHandler = new nodejs.NodejsFunction(this, 'AuthHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'auth', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    mainTable.grantReadWriteData(authHandler);
    authHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminInitiateAuth', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminCreateUser'],
      resources: [userPool.userPoolArn],
    }));
    const authIntegration = new HttpLambdaIntegration('AuthIntegration', authHandler);
    this.httpApi.addRoutes({ path: '/auth/login', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    this.httpApi.addRoutes({ path: '/auth/register', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    this.httpApi.addRoutes({ path: '/auth/magic-link', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    this.httpApi.addRoutes({ path: '/auth/magic-link/verify', methods: [apigw.HttpMethod.GET], integration: authIntegration });
    this.httpApi.addRoutes({ path: '/auth/set-password', methods: [apigw.HttpMethod.POST], integration: authIntegration, authorizer: jwtAuthorizer });
    this.httpApi.addRoutes({ path: '/auth/forgot-password', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    this.httpApi.addRoutes({ path: '/auth/confirm-forgot-password', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    this.httpApi.addRoutes({ path: '/auth/reset-password', methods: [apigw.HttpMethod.POST], integration: authIntegration });

    // CheckoutHandler
    const checkoutHandler = new nodejs.NodejsFunction(this, 'CheckoutHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'checkout', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
        STRIPE_SECRET_KEY_SSM_PATH: '/crossbox/stripe/secret-key',
      },
    });
    if (!isTest) {
      checkoutHandler.addToRolePolicy(ssmPolicy);
    }
    const checkoutIntegration = new HttpLambdaIntegration('CheckoutIntegration', checkoutHandler);
    this.httpApi.addRoutes({ path: '/checkout/session', methods: [apigw.HttpMethod.POST], integration: checkoutIntegration });

    // StripeWebhookHandler
    const stripeWebhookHandler = new nodejs.NodejsFunction(this, 'StripeWebhookHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'stripe-webhook', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
        STRIPE_SECRET_KEY_SSM_PATH: '/crossbox/stripe/secret-key',
      },
    });
    mainTable.grantReadWriteData(stripeWebhookHandler);
    stripeWebhookHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminResetUserPassword'],
      resources: [userPool.userPoolArn],
    }));
    if (!isTest) {
      stripeWebhookHandler.addToRolePolicy(ssmPolicy);
    }

    // EventBridge Bus & Rule for Stripe Events
    const partnerBusName = this.node.tryGetContext('stripePartnerBusName') || process.env.STRIPE_PARTNER_BUS_NAME;

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
        STRIPE_SECRET_KEY_SSM_PATH: '/crossbox/stripe/secret-key',
      },
    });
    mainTable.grantReadWriteData(memberHandler);
    if (!isTest) {
      memberHandler.addToRolePolicy(ssmPolicy);
    }
    const memberIntegration = new HttpLambdaIntegration('MemberIntegration', memberHandler);
    this.httpApi.addRoutes({ path: '/member/dashboard', methods: [apigw.HttpMethod.GET], integration: memberIntegration, authorizer: jwtAuthorizer });
    this.httpApi.addRoutes({ path: '/member/consent', methods: [apigw.HttpMethod.POST], integration: memberIntegration, authorizer: jwtAuthorizer });
    this.httpApi.addRoutes({ path: '/member/qr', methods: [apigw.HttpMethod.POST], integration: memberIntegration, authorizer: jwtAuthorizer });
    this.httpApi.addRoutes({ path: '/member/portal-session', methods: [apigw.HttpMethod.POST], integration: memberIntegration, authorizer: jwtAuthorizer });
    this.httpApi.addRoutes({ path: '/member/invoices', methods: [apigw.HttpMethod.GET], integration: memberIntegration, authorizer: jwtAuthorizer });

    // VerifyEntry
    const verifyEntryHandler = new nodejs.NodejsFunction(this, 'VerifyEntry', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'verify-entry', 'index.ts'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ...commonEnv,
        ENTRY_LOGS_TABLE_NAME: entryLogsTable.tableName,
        UNLOCK_QUEUE_URL: unlockQueue.queueUrl,
      },
    });
    mainTable.grantReadWriteData(verifyEntryHandler);
    entryLogsTable.grantReadWriteData(verifyEntryHandler);
    unlockQueue.grantSendMessages(verifyEntryHandler);
    const verifyEntryIntegration = new HttpLambdaIntegration('VerifyEntryIntegration', verifyEntryHandler);
    this.httpApi.addRoutes({ path: '/device/verify', methods: [apigw.HttpMethod.POST], integration: verifyEntryIntegration });

    this.unlockOutboxDispatcher = new nodejs.NodejsFunction(this, 'UnlockOutboxDispatcher', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'unlock-outbox-dispatcher', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv, UNLOCK_QUEUE_URL: unlockQueue.queueUrl },
    });
    mainTable.grantReadWriteData(this.unlockOutboxDispatcher);
    unlockQueue.grantSendMessages(this.unlockOutboxDispatcher);
    new events.Rule(this, 'UnlockOutboxDispatchSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(this.unlockOutboxDispatcher)],
    });

    // ExecuteUnlock
    const executeUnlockHandler = new nodejs.NodejsFunction(this, 'ExecuteUnlock', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'execute-unlock', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ...commonEnv,
      },
    });
    mainTable.grantReadData(executeUnlockHandler);
    executeUnlockHandler.addEventSource(new lambdaEventSources.SqsEventSource(unlockQueue, { batchSize: 1 }));

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
        UNLOCK_QUEUE_URL: unlockQueue.queueUrl,
      },
    });
    mainTable.grantReadWriteData(adminHandler);
    auditLogsTable.grantWriteData(adminHandler);
    entryLogsTable.grantReadData(adminHandler);
    unlockQueue.grantSendMessages(adminHandler);
    
    const adminIntegration = new HttpLambdaIntegration('AdminIntegration', adminHandler);
    const adminRoutes = [
      { path: '/admin/locations', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/locations/{id}', methods: [apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE] },
      { path: '/admin/locations/{id}/activity', methods: [apigw.HttpMethod.GET] },
      { path: '/admin/locations/{id}/scanners', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/locations/{id}/lockers', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/locations/{id}/scanners/{scannerId}/locker', methods: [apigw.HttpMethod.PUT] },
      { path: '/admin/locations/{id}/devices', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/devices/{id}', methods: [apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE] },
      { path: '/admin/members', methods: [apigw.HttpMethod.GET] },
      { path: '/admin/members/{id}', methods: [apigw.HttpMethod.GET] },
      { path: '/admin/members/{id}/override', methods: [apigw.HttpMethod.POST] },
      { path: '/admin/devices/{id}/unlock', methods: [apigw.HttpMethod.POST] },
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

    // GraceExpiryCron
    const graceExpiryCronHandler = new nodejs.NodejsFunction(this, 'GraceExpiryCron', {
      ...defaultNodejsFunctionProps,
      entry: path.join(handlersPath, 'grace-expiry-cron', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
      },
    });
    mainTable.grantReadWriteData(graceExpiryCronHandler);
    const cronRule = new events.Rule(this, 'GraceExpiryRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
    });
    cronRule.addTarget(new targets.LambdaFunction(graceExpiryCronHandler));
  }
}
