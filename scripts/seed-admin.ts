import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const readOutputs = () => {
  try {
    const outputsPath = path.join(__dirname, '../cdk-outputs.json');
    if (fs.existsSync(outputsPath)) {
      const data = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
      let merged: Record<string, any> = {};
      for (const stackKey of Object.keys(data)) {
        merged = { ...merged, ...data[stackKey] };
      }
      return merged;
    }
  } catch (e) {
    // Ignore
  }
  return {};
};

const run = async () => {
  const outputs = readOutputs();

  const userPoolId = process.env.USER_POOL_ID || outputs.UserPoolId || outputs.ExportsOutputRefUserPool6BA7E5F296FD7236;
  const mainTableName =
    process.env.MAIN_TABLE_NAME || outputs.MainTableName || outputs.ExportsOutputRefMainTable74195DAB4503BD7E;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@crossboxgym.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

  if (!userPoolId || !mainTableName) {
    throw new Error('USER_POOL_ID and MAIN_TABLE_NAME must be provided');
  }

  const cognito = new CognitoIdentityProviderClient({});
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  console.log(`Configuring admin user ${adminEmail}...`);

  let sub = '';
  try {
    const userRes = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: adminEmail,
        UserAttributes: [
          { Name: 'email', Value: adminEmail },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      })
    );
    sub = userRes.User?.Attributes?.find((a) => a.Name === 'sub')?.Value || '';

    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: adminEmail,
        Password: adminPassword,
        Permanent: true,
      })
    );

    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: adminEmail,
        GroupName: 'admins',
      })
    );
    console.log('Admin user created in Cognito.');
  } catch (e: any) {
    if (e.name === 'UsernameExistsException') {
      console.log('Admin user already exists in Cognito. Fetching details...');
      const existing = await cognito.send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: adminEmail,
        })
      );
      sub = existing.UserAttributes?.find((a) => a.Name === 'sub')?.Value || '';
    } else {
      throw e;
    }
  }

  if (sub) {
    await ddb.send(
      new PutCommand({
        TableName: mainTableName,
        Item: {
          PK: `USER#${sub}`,
          SK: 'PROFILE',
          email: adminEmail,
          role: 'admin',
          password_set: true,
          created_at: new Date().toISOString(),
        },
      })
    );
    await ddb.send(
      new PutCommand({
        TableName: mainTableName,
        Item: {
          PK: `USER#${sub}`,
          SK: 'SUB#sub_admin_active',
          stripe_subscription_id: 'sub_admin_active',
          stripe_customer_id: 'cus_admin_active',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      })
    );
    console.log(`Admin user profile & active subscription written to DynamoDB (PK=USER#${sub}).`);
  }

  // Seed HMAC keys if not existing
  const currentKeyRes = await ddb.send(
    new GetCommand({
      TableName: mainTableName,
      Key: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG' },
    })
  );

  if (!currentKeyRes.Item) {
    const currentKey = randomBytes(32).toString('hex');
    const prevKey = randomBytes(32).toString('hex');

    await ddb.send(
      new PutCommand({
        TableName: mainTableName,
        Item: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG', value: currentKey },
      })
    );
    await ddb.send(
      new PutCommand({
        TableName: mainTableName,
        Item: { PK: 'CONFIG#HMAC_PREVIOUS_KEY', SK: 'CONFIG', value: prevKey },
      })
    );
    console.log('HMAC keys seeded in DynamoDB.');
  }

  console.log('Seed completed successfully.');
};

run().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
