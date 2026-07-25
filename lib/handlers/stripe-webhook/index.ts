import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, ValidationError } from '../shared/http';
import { createPaymentProvider, createEmailProvider } from '../shared/providers';
import { ddb } from '../shared/ddb-client';
import { SubscriptionItem, UserItem } from '../shared/types';

const cognito = new CognitoIdentityProviderClient({});
const MAIN_TABLE_NAME = process.env.MAIN_TABLE_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'POST' && path === '/webhook/stripe') {
    const signature = event.headers['stripe-signature'];
    if (!signature) throw new ValidationError('Missing stripe-signature header');
    if (!event.body) throw new ValidationError('Missing body');

    const payload = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;

    const paymentProvider = createPaymentProvider(process.env.PAYMENT_PROVIDER || 'mock');
    let stripeEvent;
    
    try {
      stripeEvent = await paymentProvider.constructWebhookEvent(payload, signature);
    } catch (err: any) {
      throw new ValidationError(`Webhook signature verification failed: ${err.message}`);
    }

    const eventType = stripeEvent.type;

    if (eventType === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const customerEmail = session.customer_details?.email || session.customer_email;
      const subscriptionId = session.subscription;
      const customerId = session.customer;

      if (customerEmail && subscriptionId && customerId) {
        let cognitoSub = '';
        
        try {
          const createRes = await cognito.send(new AdminCreateUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: customerEmail,
            MessageAction: 'SUPPRESS',
            UserAttributes: [{ Name: 'email', Value: customerEmail }, { Name: 'email_verified', Value: 'true' }]
          }));
          cognitoSub = createRes.User?.Attributes?.find(a => a.Name === 'sub')?.Value || '';
          
          await cognito.send(new AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: customerEmail,
            Password: 'Member123!',
            Permanent: true
          })).catch(() => {});
        } catch (e: any) {
          if (e.name === 'UsernameExistsException') {
            const existingUser = await cognito.send(new AdminGetUserCommand({
              UserPoolId: USER_POOL_ID,
              Username: customerEmail
            }));
            cognitoSub = existingUser.UserAttributes?.find(a => a.Name === 'sub')?.Value || '';
          } else {
            throw e;
          }
        }

        if (cognitoSub) {
          const userId = cognitoSub;
          const now = new Date().toISOString();

          // Idempotent Put: user profile
          await ddb.send(new PutCommand({
            TableName: MAIN_TABLE_NAME,
            Item: {
              PK: `USER#${userId}`,
              SK: 'PROFILE',
              email: customerEmail,
              cognito_sub: cognitoSub,
              role: 'member',
              password_set: false,
              created_at: now,
              GSI1PK: 'USERS',
              GSI1SK: `USER#${customerEmail}`
            } as UserItem,
            ConditionExpression: 'attribute_not_exists(PK)'
          })).catch(e => {
            if (e.name !== 'ConditionalCheckFailedException') throw e;
          });

          // Idempotent Put: subscription (sets GSI1PK=STATUS#ACTIVE for GraceExpiryCron scan)
          await ddb.send(new PutCommand({
            TableName: MAIN_TABLE_NAME,
            Item: {
              PK: `USER#${userId}`,
              SK: `SUB#${subscriptionId}`,
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: customerId,
              status: 'ACTIVE',
              created_at: now,
              updated_at: now,
              GSI1PK: 'STATUS#ACTIVE',
              GSI1SK: `SUB#${subscriptionId}`
            } as SubscriptionItem,
            ConditionExpression: 'attribute_not_exists(SK)'
          })).catch(e => {
            if (e.name !== 'ConditionalCheckFailedException') throw e;
          });

          const emailProvider = createEmailProvider(process.env.EMAIL_PROVIDER || 'mock');
          await emailProvider.sendEmail({
            to: customerEmail,
            subject: 'Welcome to CrossBox Gym!',
            body: `Your account has been created. Please visit ${FRONTEND_URL}/auth/magic-link to set up your password.`,
            from: process.env.SES_SENDER_EMAIL || 'no-reply@crossbox.com'
          });
        }
      }
    } else if (eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object;
      const statusMap: Record<string, string> = {
        'active': 'ACTIVE',
        'past_due': 'PAST_DUE',
        'canceled': 'CANCELED',
        'unpaid': 'SUSPENDED'
      };
      
      const status = eventType === 'customer.subscription.deleted' 
        ? 'CANCELED' 
        : (statusMap[subscription.status] || 'EXPIRED');
        
      const subscriptionId = subscription.id;
      
      // Look up subscription using StripeSubIndex GSI
      const subQueryRes = await ddb.send(new QueryCommand({
        TableName: MAIN_TABLE_NAME,
        IndexName: 'StripeSubIndex',
        KeyConditionExpression: 'stripe_subscription_id = :subId',
        ExpressionAttributeValues: { ':subId': subscriptionId }
      }));

      if (subQueryRes.Items && subQueryRes.Items.length > 0) {
        const subItem = subQueryRes.Items[0] as SubscriptionItem;
        const nowIso = new Date().toISOString();
        
        let updateExpr = 'SET #status = :status, updated_at = :now, GSI1PK = :gsi';
        const exprAttrNames: Record<string, string> = { '#status': 'status' };
        const exprAttrValues: Record<string, any> = {
          ':status': status,
          ':now': nowIso,
          ':gsi': `STATUS#${status}`
        };

        if (status === 'PAST_DUE') {
          // Set 7-day grace period
          const graceEndIso = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
          updateExpr += ', grace_period_end = :graceEnd';
          exprAttrValues[':graceEnd'] = graceEndIso;
        }

        await ddb.send(new UpdateCommand({
          TableName: MAIN_TABLE_NAME,
          Key: { PK: subItem.PK, SK: subItem.SK },
          UpdateExpression: updateExpr,
          ExpressionAttributeNames: exprAttrNames,
          ExpressionAttributeValues: exprAttrValues
        }));
      }
    }

    return { received: true };
  }

  throw new ValidationError('Route not found');
});
