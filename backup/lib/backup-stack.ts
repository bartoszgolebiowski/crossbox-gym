import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface CrossboxGymBackupStackProps extends cdk.StackProps {
  retentionDays: number;
  schedule: string;
}

export class CrossboxGymBackupStack extends cdk.Stack {
  public readonly backupRunnerFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: CrossboxGymBackupStackProps) {
    super(scope, id, props);

    this.backupRunnerFunction = new nodejs.NodejsFunction(this, 'BackupRunner', {
      functionName: 'CrossboxGymBackupRunner',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, 'handlers', 'backup-runner', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        BACKUP_RETENTION_DAYS: String(props.retentionDays),
      },
    });

    // Tag discovery uses the Resource Groups Tagging API rather than per-table ListTagsOfResource calls.
    this.backupRunnerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['tag:GetResources'],
        resources: ['*'],
      })
    );

    this.backupRunnerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:CreateBackup',
          'dynamodb:ListBackups',
          'dynamodb:DeleteBackup',
          'dynamodb:DescribeBackup',
          'dynamodb:DescribeTable',
          'dynamodb:RestoreTableFromBackup',
        ],
        resources: ['*'],
      })
    );

    const rule = new events.Rule(this, 'BackupSchedule', {
      schedule: events.Schedule.expression(props.schedule),
    });
    rule.addTarget(new targets.LambdaFunction(this.backupRunnerFunction));

    new cdk.CfnOutput(this, 'BackupRunnerFunctionName', { value: this.backupRunnerFunction.functionName });
    new cdk.CfnOutput(this, 'BackupRunnerFunctionArn', { value: this.backupRunnerFunction.functionArn });
  }
}
