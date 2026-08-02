import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad Request') {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation Error') {
    super(400, message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict') {
    super(409, message);
    this.name = 'ConflictError';
  }
}

const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin',
};

export function withHandler(
  handler: (event: APIGatewayProxyEventV2) => Promise<any>
) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    // Handle CORS preflight OPTIONS request
    const method = event.requestContext?.http?.method || (event as any).httpMethod;
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: COMMON_HEADERS,
        body: '',
      };
    }

    try {
      const result = await handler(event);
      if (result && typeof result === 'object' && 'statusCode' in result) {
        return {
          ...result,
          headers: {
            ...COMMON_HEADERS,
            ...(result.headers || {}),
          },
        };
      }
      return {
        statusCode: 200,
        headers: COMMON_HEADERS,
        body: JSON.stringify(result ?? { success: true }),
      };
    } catch (err: any) {
      console.error('[HTTP Handler Error]:', err);
      const statusCode = err instanceof HttpError ? err.statusCode : 500;
      const message = err.message || 'Internal Server Error';
      return {
        statusCode,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: message, statusCode }),
      };
    }
  };
}

export function parseJsonBody(event: APIGatewayProxyEventV2): Record<string, any> {
  if (!event.body) return {};
  try {
    const bodyStr = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    return JSON.parse(bodyStr);
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
}

export function extractJwtClaims(event: APIGatewayProxyEventV2): Record<string, any> {
  const authorizer = (event.requestContext as any)?.authorizer;
  if (authorizer?.jwt?.claims) {
    return authorizer.jwt.claims;
  }
  if (authorizer?.lambda) {
    return authorizer.lambda;
  }
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
        return JSON.parse(payload);
      } catch {
        // Fallthrough to empty
      }
    }
  }
  return {};
}

/**
 * Normalises a groups value that may arrive in several forms:
 *  - A real JS array:  ["admins"]          (from raw JWT decode)
 *  - A serialised array string: "[admins]"  (API GW HTTP JWT authorizer)
 *  - A plain string:   "admins"
 */
function normaliseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  // API Gateway serialises Cognito array claims as "[val1, val2, ...]"
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

export function assertAdmin(event: APIGatewayProxyEventV2): string {
  const claims = extractJwtClaims(event);
  const rawGroups = claims['cognito:groups'] || claims.groups;
  const groupsArray = normaliseGroups(rawGroups);
  const isGroupAdmin = groupsArray.some((g: string) => typeof g === 'string' && ['admin', 'admins'].includes(g.toLowerCase()));
  const role = claims['custom:role'] || claims.role;
  const isRoleAdmin = typeof role === 'string' && ['admin', 'admins'].includes(role.toLowerCase());
  if (!isGroupAdmin && !isRoleAdmin) {
    throw new ForbiddenError('Admin access required');
  }
  return claims.sub || claims['cognito:username'] || claims.username || 'admin';
}
