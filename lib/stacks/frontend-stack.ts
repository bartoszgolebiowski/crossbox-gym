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
  public readonly heroBucket: s3.Bucket;
  public readonly appDistribution: cloudfront.Distribution;
  public readonly adminDistribution: cloudfront.Distribution;
  public readonly heroDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CrossboxFrontendStackProps) {
    super(scope, id, props);

    const { isTest, dataStack, apiStack } = props;
    const { mainTable, entryLogsTable, auditLogsTable, userPool, userPoolClient } = dataStack;
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

    this.heroBucket = new s3.Bucket(this, 'HeroAssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: isTest,
      removalPolicy,
    });

    const createSpaDistribution = (distributionId: string, bucket: s3.Bucket): cloudfront.Distribution =>
      new cloudfront.Distribution(this, distributionId, {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
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

    // --- 2. CloudFront Distributions ---
    this.appDistribution = createSpaDistribution('AppDistribution', this.appBucket);
    this.adminDistribution = createSpaDistribution('AdminDistribution', this.adminBucket);
    this.heroDistribution = createSpaDistribution('HeroDistribution', this.heroBucket);

    // --- 3. Bucket Deployments ---
    const configData = {
      ApiUrl: httpApi.apiEndpoint,
      UserPoolId: userPool.userPoolId,
      UserPoolClientId: userPoolClient.userPoolClientId,
      MemberAppUrl: `https://${this.appDistribution.distributionDomainName}`,
    };

    const rootDir = path.join(__dirname, '..', '..');

    const deployFrontendAssets = (
      deploymentId: string,
      distFolder: string,
      destinationBucket: s3.Bucket,
      distribution: cloudfront.Distribution
    ) =>
      new s3deploy.BucketDeployment(this, deploymentId, {
        sources: [
          s3deploy.Source.asset(path.join(rootDir, 'frontend', distFolder, 'dist')),
          s3deploy.Source.jsonData('config.json', configData),
        ],
        destinationBucket,
        distribution,
        distributionPaths: ['/*'],
        waitForDistributionInvalidation: false,
      });

    deployFrontendAssets('DeployAppAssets', 'app', this.appBucket, this.appDistribution);
    deployFrontendAssets('DeployAdminAssets', 'admin', this.adminBucket, this.adminDistribution);
    deployFrontendAssets('DeployHeroAssets', 'hero', this.heroBucket, this.heroDistribution);

    // --- 4. All Stack Outputs ---
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint, description: 'API Gateway HTTP API endpoint URL' });
    new cdk.CfnOutput(this, 'ApiId', { value: httpApi.httpApiId, description: 'API Gateway HTTP API ID' });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId, description: 'Cognito User Pool ID' });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });
    new cdk.CfnOutput(this, 'MainTableName', { value: mainTable.tableName, description: 'Main DynamoDB table name' });
    new cdk.CfnOutput(this, 'EntryLogsTableName', {
      value: entryLogsTable.tableName,
      description: 'Entry logs DynamoDB table name',
    });
    new cdk.CfnOutput(this, 'AuditLogsTableName', {
      value: auditLogsTable.tableName,
      description: 'Audit logs DynamoDB table name',
    });
    new cdk.CfnOutput(this, 'AppBucketName', {
      value: this.appBucket.bucketName,
      description: 'Member app S3 bucket name',
    });
    new cdk.CfnOutput(this, 'AppBucketArn', {
      value: this.appBucket.bucketArn,
      description: 'Member app S3 bucket ARN',
    });
    new cdk.CfnOutput(this, 'AdminBucketName', {
      value: this.adminBucket.bucketName,
      description: 'Admin app S3 bucket name',
    });
    new cdk.CfnOutput(this, 'AdminBucketArn', {
      value: this.adminBucket.bucketArn,
      description: 'Admin app S3 bucket ARN',
    });
    new cdk.CfnOutput(this, 'HeroBucketName', {
      value: this.heroBucket.bucketName,
      description: 'Hero landing page S3 bucket name',
    });
    new cdk.CfnOutput(this, 'HeroBucketArn', {
      value: this.heroBucket.bucketArn,
      description: 'Hero landing page S3 bucket ARN',
    });
    new cdk.CfnOutput(this, 'StaticBucketName', {
      value: this.adminBucket.bucketName,
      description: 'Static assets S3 bucket name (alias for admin bucket)',
    });
    new cdk.CfnOutput(this, 'AppCloudFrontUrl', {
      value: this.appDistribution.distributionDomainName,
      description: 'Member app CloudFront distribution domain name',
    });
    new cdk.CfnOutput(this, 'AdminCloudFrontUrl', {
      value: this.adminDistribution.distributionDomainName,
      description: 'Admin app CloudFront distribution domain name',
    });
    new cdk.CfnOutput(this, 'HeroCloudFrontUrl', {
      value: this.heroDistribution.distributionDomainName,
      description: 'Hero landing page CloudFront distribution domain name',
    });
    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${this.appDistribution.distributionDomainName}`,
      description: 'Member app HTTPS URL',
    });
    new cdk.CfnOutput(this, 'AdminUrl', {
      value: `https://${this.adminDistribution.distributionDomainName}`,
      description: 'Admin app HTTPS URL',
    });
    new cdk.CfnOutput(this, 'HeroUrl', {
      value: `https://${this.heroDistribution.distributionDomainName}`,
      description: 'Hero landing page HTTPS URL',
    });
    new cdk.CfnOutput(this, 'AppDistributionId', {
      value: this.appDistribution.distributionId,
      description: 'Member app CloudFront distribution ID',
    });
    new cdk.CfnOutput(this, 'AdminDistributionId', {
      value: this.adminDistribution.distributionId,
      description: 'Admin app CloudFront distribution ID',
    });
    new cdk.CfnOutput(this, 'HeroDistributionId', {
      value: this.heroDistribution.distributionId,
      description: 'Hero landing page CloudFront distribution ID',
    });
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: this.appDistribution.distributionDomainName,
      description: 'Primary CloudFront distribution domain name (alias for member app)',
    });
    new cdk.CfnOutput(this, 'StripeEventBusName', {
      value: stripeEventBus.eventBusName,
      description: 'EventBridge bus name for Stripe events',
    });
    new cdk.CfnOutput(this, 'StripeEventBusArn', {
      value: stripeEventBus.eventBusArn,
      description: 'EventBridge bus ARN for Stripe events',
    });
  }
}
