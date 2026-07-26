import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../shared/ddb-client";
import { SubscriptionItem, UserItem } from "../../shared/types";
import { WebhookContext } from "../context";

/**
 * Handles the checkout.session.completed Stripe event.
 * Creates an identity user and provisions DynamoDB profile + subscription items.
 */
export async function handleCheckoutSessionCompleted(
  session: any,
  ctx: WebhookContext,
): Promise<void> {
  const customerEmail =
    session.customer_details?.email || session.customer_email;
  const subscriptionId = session.subscription;
  const customerId = session.customer;

  if (!customerEmail || !subscriptionId || !customerId) {
    return;
  }

  const cognitoSub = await ctx.identityProvider.ensureUser(
    ctx.userPoolId,
    customerEmail,
  );
  if (!cognitoSub) {
    return;
  }

  const userId = cognitoSub;
  const now = new Date().toISOString();

  // Idempotent Put: user profile
  await ddb
    .send(
      new PutCommand({
        TableName: ctx.mainTableName,
        Item: {
          PK: `USER#${userId}`,
          SK: "PROFILE",
          email: customerEmail,
          cognito_sub: cognitoSub,
          role: "member",
          password_set: false,
          created_at: now,
          GSI1PK: "USERS",
          GSI1SK: `USER#${customerEmail}`,
        } as UserItem,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    )
    .catch((e) => {
      if (
        e.name !== "ConditionalCheckFailedException" &&
        e.name !== "ResourceNotFoundException"
      )
        throw e;
    });

  // Idempotent Put: subscription (sets GSI1PK=STATUS#ACTIVE for GraceExpiryCron scan)
  await ddb
    .send(
      new PutCommand({
        TableName: ctx.mainTableName,
        Item: {
          PK: `USER#${userId}`,
          SK: `SUB#${subscriptionId}`,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          status: "ACTIVE",
          created_at: now,
          updated_at: now,
          GSI1PK: "STATUS#ACTIVE",
          GSI1SK: `SUB#${subscriptionId}`,
        } as SubscriptionItem,
        ConditionExpression: "attribute_not_exists(SK)",
      }),
    )
    .catch((e) => {
      if (
        e.name !== "ConditionalCheckFailedException" &&
        e.name !== "ResourceNotFoundException"
      )
        throw e;
    });
}
