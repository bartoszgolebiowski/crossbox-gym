import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ddb } from '../shared/db';
import { withHandler } from '../shared/http';
import { createPaymentProvider } from '../shared/payment';
import { loadMemberEnvironment } from './environment';
import { DynamoDbMemberRepository } from './repository';
import { createMemberRouter } from './router';
import { MemberService } from './service';

export const handler = async (event: APIGatewayProxyEventV2) => {
  const environment = loadMemberEnvironment();
  const repository = new DynamoDbMemberRepository(ddb, environment.mainTableName);
  const paymentProvider = createPaymentProvider(environment.paymentProvider);
  const service = new MemberService({
    repository,
    paymentProvider,
    frontendUrl: environment.frontendUrl,
  });
  return withHandler(createMemberRouter(service))(event);
};
