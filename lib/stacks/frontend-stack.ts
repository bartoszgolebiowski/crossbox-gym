import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as path from 'path';
import { CrossboxApiStack } from './api-stack';
import { CrossboxDataStack } from './data-stack';

export interface CrossboxFrontendStackProps extends cdk.StackProps {
  isTest: boolean;
  dataStack: CrossboxDataStack;
  apiStack: CrossboxApiStack;
}

export class CrossboxFrontendStack extends cdk.Stack {
  public readonly appBucket: s3.Bucket;
  public readonly adminBucket: s3.Bucket;
  public readonly appDistribution: cloudfront.Distribution;
  public readonly adminDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CrossboxFrontendStackProps) {
    super(scope, id, props);

    const { isTest, dataStack, apiStack } = props;
    const { mainTable, entryLogsTable, auditLogsTable, unlockQueue, userPool, userPoolClient } = dataStack;
    const { httpApi, stripeEventBus } = apiStack;

    const removalPolicy = isTest ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN;

    // --- 1. S3 Buckets ---
    this.appBucket = new s3.Bucket(this, 'AppAssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: isTest,
      removalPolicy,
    });

    this.adminBucket = new s3.Bucket(this, 'AdminAssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: isTest,
      removalPolicy,
    });

    // --- 2. CloudFront Distributions ---
    this.appDistribution = new cloudfront.Distribution(this, 'AppDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.appBucket),
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

    this.adminDistribution = new cloudfront.Distribution(this, 'AdminDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.adminBucket),
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

    // --- 3. Bucket Deployments ---
    const configData = {
      ApiUrl: httpApi.apiEndpoint,
      UserPoolId: userPool.userPoolId,
      UserPoolClientId: userPoolClient.userPoolClientId,
    };

    const rootDir = path.join(__dirname, '..', '..');

    new s3deploy.BucketDeployment(this, 'DeployAppAssets', {
      sources: [
        s3deploy.Source.asset(path.join(rootDir, 'frontend', 'app', 'dist')),
        s3deploy.Source.jsonData('config.json', configData),
      ],
      destinationBucket: this.appBucket,
      distribution: this.appDistribution,
      distributionPaths: ['/*'],
      waitForDistributionInvalidation: false,
    });

    new s3deploy.BucketDeployment(this, 'DeployAdminAssets', {
      sources: [
        s3deploy.Source.asset(path.join(rootDir, 'frontend', 'admin', 'dist')),
        s3deploy.Source.jsonData('config.json', configData),
      ],
      destinationBucket: this.adminBucket,
      distribution: this.adminDistribution,
      distributionPaths: ['/*'],
      waitForDistributionInvalidation: false,
    });

    // --- 4. All Stack Outputs ---
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'MainTableName', { value: mainTable.tableName });
    new cdk.CfnOutput(this, 'EntryLogsTableName', { value: entryLogsTable.tableName });
    new cdk.CfnOutput(this, 'AuditLogsTableName', { value: auditLogsTable.tableName });
    new cdk.CfnOutput(this, 'UnlockQueueUrl', { value: unlockQueue.queueUrl });
    new cdk.CfnOutput(this, 'AppBucketName', { value: this.appBucket.bucketName });
    new cdk.CfnOutput(this, 'AdminBucketName', { value: this.adminBucket.bucketName });
    new cdk.CfnOutput(this, 'StaticBucketName', { value: this.adminBucket.bucketName });
    new cdk.CfnOutput(this, 'AppCloudFrontUrl', { value: this.appDistribution.distributionDomainName });
    new cdk.CfnOutput(this, 'AdminCloudFrontUrl', { value: this.adminDistribution.distributionDomainName });
    new cdk.CfnOutput(this, 'AppDistributionId', { value: this.appDistribution.distributionId });
    new cdk.CfnOutput(this, 'AdminDistributionId', { value: this.adminDistribution.distributionId });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: this.appDistribution.distributionDomainName });
    new cdk.CfnOutput(this, 'StripeEventBusName', { value: stripeEventBus.eventBusName });
  }
}
