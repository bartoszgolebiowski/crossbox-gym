import { APIGatewayProxyEventV2 } from 'aws-lambda';

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message);
  }
}

export interface HandlerResult {
  statusCode: number;
  body: unknown;
}

type BusinessHandler = (event: APIGatewayProxyEventV2) => Promise<HandlerResult | unknown>;

function corsHeaders(event?: APIGatewayProxyEventV2): Record<string, string> {
  const requestOrigin = event?.headers?.origin || event?.headers?.Origin;
  return {
    'Access-Control-Allow-Origin': requestOrigin || '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

/** Parses JSON body from API Gateway V2 event (handles base64 encoding if needed) */
export function parseJsonBody(event: APIGatewayProxyEventV2): Record<string, any> {
  if (!event.body) return {};
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    return JSON.parse(rawBody) as Record<string, any>;
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

/** Extracts JWT claims from API Gateway authorizer context */
export function extractJwtClaims(event: APIGatewayProxyEventV2): Record<string, any> | undefined {
  return (event.requestContext as any).authorizer?.jwt?.claims;
}

/** Asserts caller is an authenticated admin user, returning admin user ID */
export function assertAdmin(event: APIGatewayProxyEventV2): string {
  const claims = extractJwtClaims(event);
  if (!claims) throw new UnauthorizedError('Unauthorized');
  const groups = claims['cognito:groups'];
  let isAdmin = false;
  if (Array.isArray(groups)) {
    isAdmin = groups.includes('admins');
  } else if (typeof groups === 'string') {
    isAdmin = groups.includes('admins');
  }
  if (!isAdmin) throw new ForbiddenError('Admin access required');
  return (claims.sub as string) || 'admin';
}

/**
 * Standard handler wrapper for API Gateway HTTP API (v2)
 * Ensures consistent JSON formatting, status codes, CORS headers, and structured logging.
 */
export function withHandler(handler: BusinessHandler) {
  return async (event: APIGatewayProxyEventV2) => {
    const start = Date.now();
    const requestContext = {
      method: event?.requestContext?.http?.method || 'POST',
      path: event?.requestContext?.http?.path || '/device/verify',
    };

    try {
      const res = await handler(event);
      console.log(JSON.stringify({
        level: 'info',
        ...requestContext,
        durationMs: Date.now() - start,
      }));

      // If handler returns { statusCode, body } structure, use it directly
      if (res && typeof res === 'object' && 'statusCode' in res && 'body' in res) {
        const hResult = res as HandlerResult;
        return {
          statusCode: hResult.statusCode,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
          body: typeof hResult.body === 'string' ? hResult.body : JSON.stringify(hResult.body),
        };
      }

      // Default: assume res is the body, return 200 OK
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
        body: JSON.stringify(res),
      };
    } catch (err) {
      if (err instanceof HttpError) {
        console.log(JSON.stringify({
          level: 'warn',
          ...requestContext,
          statusCode: err.statusCode,
          message: err.message,
          durationMs: Date.now() - start,
        }));
        return {
          statusCode: err.statusCode,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
          body: JSON.stringify({ message: err.message }),
        };
      }

      const error = err as Error;
      console.error(JSON.stringify({
        level: 'error',
        ...requestContext,
        message: error.message,
        stack: error.stack,
        durationMs: Date.now() - start,
      }));

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}
