import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

export interface CrossboxGymStackProps extends cdk.StackProps {
  isTest: boolean;
}

export class CrossboxGymStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CrossboxGymStackProps) {
    super(scope, id, props);

    const isTest = props.isTest;
    const removalPolicy = isTest ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN;

    // --- 1. DynamoDB Tables ---

    const mainTable = new dynamodb.Table(this, 'MainTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
    });

    mainTable.addGlobalSecondaryIndex({
      indexName: 'EmailIndex',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    mainTable.addGlobalSecondaryIndex({
      indexName: 'CognitoSubIndex',
      partitionKey: { name: 'cognito_sub', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
    mainTable.addGlobalSecondaryIndex({
      indexName: 'StripeSubIndex',
      partitionKey: { name: 'stripe_subscription_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    mainTable.addGlobalSecondaryIndex({
      indexName: 'ApiKeyIndex',
      partitionKey: { name: 'api_key_hash', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    mainTable.addGlobalSecondaryIndex({
      indexName: 'DeviceIdIndex',
      partitionKey: { name: 'device_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const entryLogsTable = new dynamodb.Table(this, 'EntryLogs', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
    });

    entryLogsTable.addGlobalSecondaryIndex({
      indexName: 'AntiPassbackIndex',
      partitionKey: { name: 'AntiPassbackPK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const auditLogsTable = new dynamodb.Table(this, 'AuditLogs', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });


    // --- 2. SQS ---

    const unlockQueue = new sqs.Queue(this, 'UnlockQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
    });


    // --- 3. Cognito ---

    const userPool = new cognito.UserPool(this, 'UserPool', {
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

    new cognito.CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admins',
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });


    // --- 4. S3 ---

    const staticBucket = new s3.Bucket(this, 'StaticAssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: isTest,
      removalPolicy,
    });


    // --- 5. CloudFront ---

    const distribution = new cloudfront.Distribution(this, 'CDNDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(staticBucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new s3deploy.BucketDeployment(this, 'DeployStaticAssets', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', 'public'))],
      destinationBucket: staticBucket,
    });


    // --- 6. API Gateway (HTTP) ---

    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
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


    // --- 7. Lambda Functions ---

    const stripeTestSecretKey = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
    const paymentProvider = (stripeTestSecretKey || !isTest) ? 'stripe' : 'mock';
    const emailProvider = isTest ? 'mock' : 'ses';
    const lockProvider = isTest ? 'mock' : 'http';
    const sesSenderEmail = this.node.tryGetContext('sesSenderEmail') || 'no-reply@crossbox.com';
    const contextFrontendUrl = this.node.tryGetContext('frontendUrl');
    const frontendUrl = (contextFrontendUrl && !contextFrontendUrl.includes('localhost')) 
      ? contextFrontendUrl 
      : `https://${distribution.distributionDomainName}`;

    const commonEnv = {
      MAIN_TABLE_NAME: mainTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      EMAIL_PROVIDER: emailProvider,
      PAYMENT_PROVIDER: paymentProvider,
      LOCK_PROVIDER: lockProvider,
      SES_SENDER_EMAIL: sesSenderEmail,
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

    const sesPolicy = new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    });

    const ssmPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'kms:Decrypt'],
      resources: [
        cdk.Arn.format({ service: 'ssm', resource: 'parameter', resourceName: 'crossbox/stripe/secret-key' }, this),
        cdk.Arn.format({ service: 'ssm', resource: 'parameter', resourceName: 'crossbox/stripe/webhook-secret' }, this)
      ],
    });

    // AuthHandler
    const authHandler = new nodejs.NodejsFunction(this, 'AuthHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(__dirname, 'handlers', 'auth', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    mainTable.grantReadWriteData(authHandler);
    authHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminInitiateAuth', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminCreateUser'],
      resources: [userPool.userPoolArn],
    }));
    if (!isTest) {
      authHandler.addToRolePolicy(sesPolicy);
    }
    const authIntegration = new HttpLambdaIntegration('AuthIntegration', authHandler);
    httpApi.addRoutes({ path: '/auth/login', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    httpApi.addRoutes({ path: '/auth/register', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    httpApi.addRoutes({ path: '/auth/magic-link', methods: [apigw.HttpMethod.POST], integration: authIntegration });
    httpApi.addRoutes({ path: '/auth/magic-link/verify', methods: [apigw.HttpMethod.GET], integration: authIntegration });
    httpApi.addRoutes({ path: '/auth/set-password', methods: [apigw.HttpMethod.POST], integration: authIntegration, authorizer: jwtAuthorizer });

    // CheckoutHandler
    const checkoutHandler = new nodejs.NodejsFunction(this, 'CheckoutHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(__dirname, 'handlers', 'checkout', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        PAYMENT_PROVIDER: paymentProvider,
        STRIPE_TEST_SECRET_KEY: stripeTestSecretKey,
        STRIPE_SECRET_KEY_SSM_PATH: '/crossbox/stripe/secret-key',
      },
    });
    if (!isTest) {
      checkoutHandler.addToRolePolicy(ssmPolicy);
    }
    const checkoutIntegration = new HttpLambdaIntegration('CheckoutIntegration', checkoutHandler);
    httpApi.addRoutes({ path: '/checkout/session', methods: [apigw.HttpMethod.POST], integration: checkoutIntegration });

    // StripeWebhookHandler
    const stripeWebhookHandler = new nodejs.NodejsFunction(this, 'StripeWebhookHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(__dirname, 'handlers', 'stripe-webhook', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        PAYMENT_PROVIDER: paymentProvider,
        EMAIL_PROVIDER: emailProvider,
        SES_SENDER_EMAIL: sesSenderEmail,
        STRIPE_SECRET_KEY_SSM_PATH: '/crossbox/stripe/secret-key',
      },
    });
    mainTable.grantReadWriteData(stripeWebhookHandler);
    stripeWebhookHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminAddUserToGroup', 'cognito-idp:AdminSetUserPassword'],
      resources: [userPool.userPoolArn],
    }));
    if (!isTest) {
      stripeWebhookHandler.addToRolePolicy(sesPolicy);
      stripeWebhookHandler.addToRolePolicy(ssmPolicy);
    }

    // EventBridge Bus & Rule for Stripe Events
    const partnerBusName = this.node.tryGetContext('stripePartnerBusName') || process.env.STRIPE_PARTNER_BUS_NAME;

    const stripeEventBus = partnerBusName
      ? events.EventBus.fromEventBusName(this, 'StripeEventBus', partnerBusName)
      : new events.EventBus(this, 'StripeEventBus', {
          eventBusName: isTest ? `${this.stackName}-StripeBus` : 'stripe-events-bus',
        });

    const stripeEventRule = new events.Rule(this, 'StripeEventRule', {
      eventBus: stripeEventBus,
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
      entry: path.join(__dirname, 'handlers', 'member', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
        PAYMENT_PROVIDER: paymentProvider,
        STRIPE_SECRET_KEY_SSM_PATH: '/crossbox/stripe/secret-key',
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });
    mainTable.grantReadWriteData(memberHandler);
    if (!isTest) {
      memberHandler.addToRolePolicy(ssmPolicy);
    }
    const memberIntegration = new HttpLambdaIntegration('MemberIntegration', memberHandler);
    httpApi.addRoutes({ path: '/member/dashboard', methods: [apigw.HttpMethod.GET], integration: memberIntegration, authorizer: jwtAuthorizer });
    httpApi.addRoutes({ path: '/member/consent', methods: [apigw.HttpMethod.POST], integration: memberIntegration, authorizer: jwtAuthorizer });
    httpApi.addRoutes({ path: '/member/qr', methods: [apigw.HttpMethod.POST], integration: memberIntegration, authorizer: jwtAuthorizer });
    httpApi.addRoutes({ path: '/member/portal-session', methods: [apigw.HttpMethod.POST], integration: memberIntegration, authorizer: jwtAuthorizer });
    httpApi.addRoutes({ path: '/member/invoices', methods: [apigw.HttpMethod.GET], integration: memberIntegration, authorizer: jwtAuthorizer });

    // VerifyEntry
    const verifyEntryHandler = new nodejs.NodejsFunction(this, 'VerifyEntry', {
      ...defaultNodejsFunctionProps,
      entry: path.join(__dirname, 'handlers', 'verify-entry', 'index.ts'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(10),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
        ENTRY_LOGS_TABLE_NAME: entryLogsTable.tableName,
        UNLOCK_QUEUE_URL: unlockQueue.queueUrl,
      },
    });
    mainTable.grantReadData(verifyEntryHandler);
    entryLogsTable.grantReadWriteData(verifyEntryHandler);
    unlockQueue.grantSendMessages(verifyEntryHandler);
    const verifyEntryIntegration = new HttpLambdaIntegration('VerifyEntryIntegration', verifyEntryHandler);
    httpApi.addRoutes({ path: '/device/verify', methods: [apigw.HttpMethod.POST], integration: verifyEntryIntegration });

    // ExecuteUnlock
    const executeUnlockHandler = new nodejs.NodejsFunction(this, 'ExecuteUnlock', {
      ...defaultNodejsFunctionProps,
      entry: path.join(__dirname, 'handlers', 'execute-unlock', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
        LOCK_PROVIDER: lockProvider,
      },
    });
    mainTable.grantReadData(executeUnlockHandler);
    executeUnlockHandler.addEventSource(new lambdaEventSources.SqsEventSource(unlockQueue, { batchSize: 1 }));

    // AdminHandler
    const adminHandler = new nodejs.NodejsFunction(this, 'AdminHandler', {
      ...defaultNodejsFunctionProps,
      entry: path.join(__dirname, 'handlers', 'admin', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
        AUDIT_LOGS_TABLE_NAME: auditLogsTable.tableName,
        UNLOCK_QUEUE_URL: unlockQueue.queueUrl,
        STATIC_ASSETS_BUCKET_NAME: staticBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });
    mainTable.grantReadWriteData(adminHandler);
    auditLogsTable.grantWriteData(adminHandler);
    unlockQueue.grantSendMessages(adminHandler);
    staticBucket.grantPut(adminHandler);
    
    const adminIntegration = new HttpLambdaIntegration('AdminIntegration', adminHandler);
    const adminRoutes = [
      { path: '/admin/locations', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/locations/{id}', methods: [apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE] },
      { path: '/admin/locations/{id}/devices', methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST] },
      { path: '/admin/devices/{id}', methods: [apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE] },
      { path: '/admin/members', methods: [apigw.HttpMethod.GET] },
      { path: '/admin/members/{id}', methods: [apigw.HttpMethod.GET] },
      { path: '/admin/members/{id}/override', methods: [apigw.HttpMethod.POST] },
      { path: '/admin/devices/{id}/unlock', methods: [apigw.HttpMethod.POST] },
      { path: '/admin/hmac/rotate', methods: [apigw.HttpMethod.POST] },
    ];
    for (const route of adminRoutes) {
      httpApi.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: adminIntegration,
        authorizer: jwtAuthorizer,
      });
    }

    // GraceExpiryCron
    const graceExpiryCronHandler = new nodejs.NodejsFunction(this, 'GraceExpiryCron', {
      ...defaultNodejsFunctionProps,
      entry: path.join(__dirname, 'handlers', 'grace-expiry-cron', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
        EMAIL_PROVIDER: emailProvider,
        SES_SENDER_EMAIL: sesSenderEmail,
      },
    });
    mainTable.grantReadWriteData(graceExpiryCronHandler);
    if (!isTest) {
      graceExpiryCronHandler.addToRolePolicy(sesPolicy);
    }
    const cronRule = new events.Rule(this, 'GraceExpiryRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
    });
    cronRule.addTarget(new targets.LambdaFunction(graceExpiryCronHandler));


    // --- 8. Stack Outputs ---

    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'MainTableName', { value: mainTable.tableName });
    new cdk.CfnOutput(this, 'EntryLogsTableName', { value: entryLogsTable.tableName });
    new cdk.CfnOutput(this, 'AuditLogsTableName', { value: auditLogsTable.tableName });
    new cdk.CfnOutput(this, 'UnlockQueueUrl', { value: unlockQueue.queueUrl });
    new cdk.CfnOutput(this, 'StaticBucketName', { value: staticBucket.bucketName });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'StripeEventBusName', { value: stripeEventBus.eventBusName });
  }
}
