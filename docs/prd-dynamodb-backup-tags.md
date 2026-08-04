# PRD: DynamoDB Backup Tags for Crossbox Gym

## 1. Goal

Add AWS tags to all production DynamoDB tables in the `crossbox-gym` repository so that an external backup system (deployed from a separate repository) can discover, back up, and restore them without hard-coding table names or ARNs.

## 2. Scope

Applies to the three tables created in `lib/stacks/data-stack.ts`:

- `MainTable`
- `EntryLogs`
- `AuditLogs`

## 3. Tag specification

| Key | Value | Meaning |
|---|---|---|
| `crossbox-gym-backup` | `true` | Marks the table for backup |
| `crossbox-gym-env` | `<env>` | Distinguishes environments (`dev`, `prod`, etc.) |
| `crossbox-gym-table` | `<logical-name>` | Stable logical name: `MainTable`, `EntryLogs`, `AuditLogs` |
| `crossbox-gym-project` | `crossbox-gym` | Project identifier |

The backup system will discover tables by looking for `crossbox-gym-backup = true` in the same account and region.

## 4. Requirements

### 4.1 Tagging logic

- All three tables receive all four tags.
- The value of `crossbox-gym-env` must come from an environment variable or CDK context, defaulting to `dev`.
- Tags must be applied using CDK L2 tags (`cdk.Tags.of(table).add(...)`).
- The implementation must not break existing test environments or integration tests.

### 4.2 Conditional tagging

- Tagging must only happen when `props.isTest === false`.
- Test stacks (`isTest: true`) must NOT be tagged for backup, to avoid the backup system accidentally including ephemeral test tables.

### 4.3 Backward compatibility

- No changes to table schemas, removal policies, or IAM permissions.
- Existing deployments must not be recreated or replaced; adding tags is an in-place update.

## 5. Acceptance criteria

- [ ] `data-stack.ts` tags `MainTable`, `EntryLogs`, and `AuditLogs` with the four specified tags.
- [ ] Tags are applied only when `isTest` is false.
- [ ] `crossbox-gym-env` is configurable via env var `CROSSBOX_ENV` or CDK context `crossbox-env`.
- [ ] `npm run typecheck` passes.
- [ ] Existing unit and integration tests still pass.
- [ ] A follow-up PRD for the backup repository is provided separately.

## 6. Non-goals

- This PRD does not create the backup Lambda, schedule, or restore scripts.
- It does not configure AWS Backup, PITR, or cross-region replication.

## 7. Implementation hints

```typescript
const env = this.node.tryGetContext('crossbox-env') || process.env.CROSSBOX_ENV || 'dev';

if (!isTest) {
  const tagTable = (table: dynamodb.Table, logicalName: string) => {
    cdk.Tags.of(table).add('crossbox-gym-backup', 'true');
    cdk.Tags.of(table).add('crossbox-gym-env', env);
    cdk.Tags.of(table).add('crossbox-gym-table', logicalName);
    cdk.Tags.of(table).add('crossbox-gym-project', 'crossbox-gym');
  };

  tagTable(this.mainTable, 'MainTable');
  tagTable(this.entryLogsTable, 'EntryLogs');
  tagTable(this.auditLogsTable, 'AuditLogs');
}
```

## 8. Open questions

None. This PRD is ready for implementation.
