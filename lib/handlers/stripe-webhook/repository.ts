import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SubscriptionItem, UserItem } from '../shared/types';

export interface CreateUserProfileParams {
  userId: string;
  email: string;
  cognitoSub: string;
  role: string;
  createdAt: string;
}

export interface CreateSubscriptionParams {
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  createdAt: string;
}

export interface UpdateSubscriptionStatusParams {
  pk: string;
  sk: string;
  status: string;
  gracePeriodEnd?: string | null;
  updatedAt: string;
}

export interface StoreInvoiceParams {
  userId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  pdfUrl: string | null;
  total: number;
  taxAmount: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt: string;
}

export interface BillingRepository {
  createUserProfile(params: CreateUserProfileParams): Promise<void>;
  createSubscription(params: CreateSubscriptionParams): Promise<void>;
  findSubscriptionByStripeId(stripeSubscriptionId: string): Promise<SubscriptionItem | undefined>;
  updateSubscriptionStatus(params: UpdateSubscriptionStatusParams): Promise<void>;
  storeInvoice(params: StoreInvoiceParams): Promise<void>;
}

export class DynamoDbBillingRepository implements BillingRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async createUserProfile(params: CreateUserProfileParams): Promise<void> {
    await this.client
      .send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `USER#${params.userId}`,
            SK: 'PROFILE',
            email: params.email,
            cognito_sub: params.cognitoSub,
            role: params.role,
            password_set: false,
            created_at: params.createdAt,
            GSI1PK: 'USERS',
            GSI1SK: `USER#${params.email}`,
          } as UserItem,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      )
      .catch((e) => {
        if (e.name !== 'ConditionalCheckFailedException' && e.name !== 'ResourceNotFoundException') throw e;
      });
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<void> {
    await this.client
      .send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `USER#${params.userId}`,
            SK: `SUB#${params.stripeSubscriptionId}`,
            stripe_subscription_id: params.stripeSubscriptionId,
            stripe_customer_id: params.stripeCustomerId,
            status: params.status,
            created_at: params.createdAt,
            updated_at: params.createdAt,
            GSI1PK: `STATUS#${params.status}`,
            GSI1SK: `SUB#${params.stripeSubscriptionId}`,
          } as SubscriptionItem,
          ConditionExpression: 'attribute_not_exists(SK)',
        })
      )
      .catch((e) => {
        if (e.name !== 'ConditionalCheckFailedException' && e.name !== 'ResourceNotFoundException') throw e;
      });
  }

  async findSubscriptionByStripeId(stripeSubscriptionId: string): Promise<SubscriptionItem | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'StripeSubIndex',
        KeyConditionExpression: 'stripe_subscription_id = :subId',
        ExpressionAttributeValues: { ':subId': stripeSubscriptionId },
      })
    );
    return result.Items?.[0] as SubscriptionItem | undefined;
  }

  async updateSubscriptionStatus(params: UpdateSubscriptionStatusParams): Promise<void> {
    let updateExpr = 'SET #status = :status, updated_at = :now, GSI1PK = :gsi';
    const exprAttrNames: Record<string, string> = { '#status': 'status' };
    const exprAttrValues: Record<string, any> = {
      ':status': params.status,
      ':now': params.updatedAt,
      ':gsi': `STATUS#${params.status}`,
    };

    if (params.gracePeriodEnd !== undefined) {
      updateExpr += ', grace_period_end = :graceEnd';
      exprAttrValues[':graceEnd'] = params.gracePeriodEnd;
    }

    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: params.pk, SK: params.sk },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues,
      })
    );
  }

  async storeInvoice(params: StoreInvoiceParams): Promise<void> {
    await this.client
      .send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `USER#${params.userId}`,
            SK: `INVOICE#${params.invoiceId}`,
            invoice_id: params.invoiceId,
            invoice_number: params.invoiceNumber,
            pdf_url: params.pdfUrl,
            total: params.total,
            tax_amount: params.taxAmount,
            currency: params.currency,
            status: params.status,
            created_at: params.createdAt,
            paid_at: params.paidAt,
          },
        })
      )
      .catch(() => {});
  }
}
