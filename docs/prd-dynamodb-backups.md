# PRD: DynamoDB Daily Backups for Crossbox Gym

## 1. Goal

Create a separate, minimal AWS CDK project that automatically backs up all DynamoDB tables tagged by the `crossbox-gym` project once per day, keeps backups for 14 days, and provides scripts to restore a table on demand.

The backup system must live in a **separate repository** so it is never deleted or affected by `npm run destroy` in the main project.

## 2. Scope

- Discover DynamoDB tables by tag: `crossbox-gym-backup = true`.
- Create an on-demand backup of every matching table once per day.
- Delete backups older than 14 days.
- Provide CLI scripts for:
  - Deploying the backup infrastructure.
  - Running an ad-hoc backup now.
  - Listing backups per table.
  - Restoring a table from a backup.

## 3. Architecture

### 3.1 Repository layout

```
crossbox-gym-backups/
├── bin/
│   └── app.ts                 # CDK app entry point
├── lib/
│   └── backup-stack.ts        # Backup stack definition
├── scripts/
│   ├── deploy.mjs             # Deploy the backup stack
│   ├── backup-now.mjs         # Trigger an immediate backup
│   ├── list-backups.mjs       # List recent backups
│   └── restore.mjs            # Restore a table from backup
├── cdk.json
├── package.json
├── tsconfig.json
└── README.md
```

### 3.2 AWS resources

| Resource | Purpose |
|---|---|
| `CrossboxGymBackupStack` | CDK stack |
| IAM Role for Lambda | Allows the backup Lambda to list, tag, create, delete, and restore DynamoDB tables and backups |
| Lambda function `CrossboxGymBackupRunner` | Triggered daily by EventBridge; scans tagged tables, creates backups, deletes old backups |
| EventBridge rule | `cron(0 2 * * ? *)` — every day at 02:00 UTC |
| CloudWatch Logs | Lambda execution logs |

## 4. Requirements

### 4.1 Discovery

- The Lambda must call `dynamodb:ListTables` and `dynamodb:ListTagsOfResource`.
- Only tables with `crossbox-gym-backup = true` in the same AWS account and region are backed up.

### 4.2 Backup creation

- For each discovered table, call `dynamodb:CreateBackup` with a backup name:
  ```
  crossbox-gym-<env>-<table-name>-<YYYYMMDD-HHmmss>
  ```
- Backups are created sequentially or in parallel with basic error handling.
- Failed backups are logged to CloudWatch but do not block backups of other tables.

### 4.3 Retention

- After creating backups, list all backups for each table using `dynamodb:ListBackups`.
- Delete backups older than 14 days using `dynamodb:DeleteBackup`.
- Only delete backups whose names start with `crossbox-gym-` to avoid touching unrelated backups.

### 4.4 Restore

- The `restore.mjs` script accepts:
  ```
  node scripts/restore.mjs <table-name> [backup-arn]
  ```
- If no `backup-arn` is provided, the script uses the most recent successful backup of that table.
- The restored table name must be:
  ```
  <table-name>-restore-<YYYYMMDD-HHmmss>
  ```
- The script must refuse to overwrite an existing table and print the new table name on success.
- The restore script must be run manually; it is never triggered automatically.

### 4.5 Scripts

#### `scripts/deploy.mjs`

- Reads `.env` or env vars for `AWS_REGION`, `AWS_ACCOUNT`, `CROSSBOX_ENV`.
- Runs `cdk deploy CrossboxGymBackupStack`.
- Fails if credentials are missing.

#### `scripts/backup-now.mjs`

- Invokes the backup Lambda directly using `lambda:InvokeFunction`.
- Waits for completion and prints the result.

#### `scripts/list-backups.mjs`

- Lists backups grouped by table.
- Shows backup name, ARN, status, and creation time.
- Defaults to the last 14 days.

#### `scripts/restore.mjs <table-name> [backup-arn]`

- Restores a table as described in section 4.4.

## 5. IAM policy for Lambda

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:ListTables",
        "dynamodb:ListTagsOfResource",
        "dynamodb:CreateBackup",
        "dynamodb:ListBackups",
        "dynamodb:DeleteBackup",
        "dynamodb:DescribeBackup",
        "dynamodb:RestoreTableFromBackup"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

## 6. Lambda runtime

- Node.js 22.x LTS.
- Use AWS SDK v3 (`@aws-sdk/client-dynamodb`).
- Code is written in TypeScript and bundled by the CDK Node.js Lambda construct or compiled with `esbuild`.

## 7. Configuration

| Variable | Default | Description |
|---|---|---|
| `CROSSBOX_ENV` | `dev` | Environment filter for discovered tables |
| `BACKUP_RETENTION_DAYS` | `14` | How many days to keep backups |
| `BACKUP_SCHEDULE` | `cron(0 2 * * ? *)` | EventBridge schedule |

## 8. Acceptance criteria

- [ ] `npm run deploy` in the backup repo deploys the stack successfully.
- [ ] The Lambda runs on schedule and creates one backup per tagged table per day.
- [ ] Backups older than 14 days are deleted automatically.
- [ ] `node scripts/backup-now.mjs` triggers an immediate backup.
- [ ] `node scripts/list-backups.mjs` shows backups grouped by table.
- [ ] `node scripts/restore.mjs <table>` restores to a new table and prints its name.
- [ ] Restoring a table does not modify or delete the original table.
- [ ] The backup stack is independent of the main `crossbox-gym` CDK app.

## 9. Non-goals

- Cross-account backups.
- Cross-region replication.
- Point-in-time recovery (PITR) configuration in the main repo.
- Encryption-at-rest customization (uses AWS-managed DynamoDB backup encryption).
- Backup vault lock or AWS Backup integration.

## 10. Cost estimate

- Backup storage: ~$0.10 per GB-month.
- Daily backups, 14-day retention: roughly `table-size × 14 × $0.10/month`.
- For a 1 GB database: ~$1.40/month.
- For a 10 GB database: ~$14/month.
- Lambda and EventBridge: negligible at this scale.

## 11. Open questions

None. This PRD is ready for implementation.
