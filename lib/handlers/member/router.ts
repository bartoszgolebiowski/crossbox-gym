import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { extractJwtClaims, NotFoundError, parseJsonBody, UnauthorizedError, ValidationError } from '../shared/http';
import { MemberService } from './service';

export function createMemberRouter(service: MemberService) {
  return async (event: APIGatewayProxyEventV2) => {
    const claims = extractJwtClaims(event);
    const userId = (claims.sub as string) || (claims['cognito:username'] as string);
    if (!userId) {
      throw new UnauthorizedError('Unauthorized');
    }

    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    if (method === 'GET' && path === '/member/dashboard') {
      return service.getDashboard(userId);
    }

    if (method === 'POST' && path === '/member/consent') {
      const { terms_version: termsVersion } = parseJsonBody(event);
      if (typeof termsVersion !== 'string' || !termsVersion.trim()) {
        throw new ValidationError('Missing terms_version');
      }
      return service.recordConsent(userId, termsVersion, event.requestContext.http.sourceIp || 'unknown');
    }

    if (method === 'POST' && path === '/member/qr') {
      return service.createQrCode(userId);
    }

    if (method === 'POST' && path === '/member/portal-session') {
      const body = parseJsonBody(event);
      const query = event.queryStringParameters || {};
      const returnUrl = body.returnUrl || query.returnUrl || body.redirectUrl || query.redirectUrl;
      return service.createPortalSession(userId, returnUrl);
    }

    if (method === 'GET' && path === '/member/invoices') {
      return service.getInvoices(userId);
    }

    throw new NotFoundError('Route not found');
  };
}
