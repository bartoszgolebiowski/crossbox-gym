import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { extractJwtClaims, NotFoundError, parseJsonBody, UnauthorizedError } from '../shared/http';
import { AuthService } from './service';

export function createAuthRouter(service: AuthService) {
  return async (event: APIGatewayProxyEventV2) => {
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    if (method === 'POST' && path === '/auth/login') {
      const { email, password } = parseJsonBody(event);
      return service.login(email, password);
    }

    if (method === 'POST' && path === '/auth/magic-link') {
      const { email } = parseJsonBody(event);
      return service.createMagicLink(email);
    }

    if (method === 'GET' && path === '/auth/magic-link/verify') {
      const query = event.queryStringParameters || {};
      return service.verifyMagicLink(query.token || '', query.email || '');
    }

    if (method === 'POST' && path === '/auth/set-password') {
      const claims = extractJwtClaims(event);
      if (!claims) throw new UnauthorizedError('Unauthorized');
      const { newPassword } = parseJsonBody(event);
      return service.setPassword(claims.sub as string, claims.email as string, newPassword);
    }

    if (method === 'POST' && path === '/auth/forgot-password') {
      const { email } = parseJsonBody(event);
      return service.forgotPassword(email);
    }

    if (method === 'POST' && path === '/auth/confirm-forgot-password') {
      const { email, code, newPassword } = parseJsonBody(event);
      return service.confirmForgotPassword(email, code, newPassword);
    }

    if (method === 'POST' && path === '/auth/reset-password') {
      const { email, token, newPassword } = parseJsonBody(event);
      return service.resetPassword(email, token, newPassword);
    }

    if (method === 'POST' && path === '/auth/register') {
      const { email, password } = parseJsonBody(event);
      return service.register(email, password);
    }

    throw new NotFoundError('Route not found');
  };
}
