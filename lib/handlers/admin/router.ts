import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { assertAdmin, NotFoundError, parseJsonBody } from '../shared/http';
import { AdminService } from './service';

function normalizePath(event: APIGatewayProxyEventV2): string {
  const rawPath = event.requestContext.http.path || event.rawPath || '';
  return rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
}

export function createAdminRouter(service: AdminService) {
  return async (event: APIGatewayProxyEventV2) => {
    const adminId = assertAdmin(event);
    const method = event.requestContext.http.method;
    const path = normalizePath(event);

    if (method === 'GET' && path === '/admin/locations') {
      return service.listLocations();
    }

    if (method === 'POST' && path === '/admin/locations') {
      const body = parseJsonBody(event);
      return service.createLocation(adminId, body.name, body.address);
    }

    if (method === 'PUT' && /^\/admin\/locations\/[^/]+$/.test(path)) {
      const id = path.split('/')[3];
      const body = parseJsonBody(event);
      return service.updateLocation(adminId, id, body.name, body.address);
    }

    if (method === 'DELETE' && path.startsWith('/admin/locations/')) {
      const id = path.split('/')[3];
      return service.deleteLocation(adminId, id);
    }

    if (method === 'GET' && /^\/admin\/locations\/[^/]+\/activity$/.test(path)) {
      const locationId = path.split('/')[3];
      const scannerId = event.queryStringParameters?.scanner_id;
      const limit = event.queryStringParameters?.limit
        ? parseInt(event.queryStringParameters.limit, 10)
        : undefined;
      const nextToken = event.queryStringParameters?.next_token;
      return service.getActivity(adminId, locationId, scannerId, {
        limit: Number.isNaN(limit) ? undefined : limit,
        nextToken,
      });
    }

    if (method === 'GET' && path.includes('/devices')) {
      const locationId = path.split('/')[3];
      return service.listDevices(adminId, locationId);
    }

    if ((method === 'POST' || method === 'GET') && path.endsWith('/health')) {
      const deviceId = path.split('/')[3];
      const locationId = event.queryStringParameters?.location_id;
      return service.checkDeviceHealth(adminId, deviceId, locationId);
    }

    if (method === 'POST' && path.endsWith('/unlock')) {
      const deviceId = path.split('/')[3];
      const body = parseJsonBody(event);
      return service.remoteUnlock(adminId, deviceId, body.reason);
    }

    if (method === 'POST' && path.includes('/devices')) {
      const locationId = path.split('/')[3];
      const body = parseJsonBody(event);
      return service.createDevice(adminId, locationId, {
        device_id: body.device_id,
        name: body.name,
        type: body.type,
        connection_params: body.connection_params,
      });
    }

    if (method === 'POST' && path === '/admin/hmac/rotate') {
      return service.rotateHmacKey(adminId);
    }

    if (method === 'GET' && path === '/admin/members') {
      return service.listMembers();
    }

    if (method === 'GET' && path.startsWith('/admin/members/')) {
      const userId = path.split('/')[3];
      return service.getMember(adminId, userId);
    }

    if (method === 'POST' && path.includes('/override')) {
      const userId = path.split('/')[3];
      const body = parseJsonBody(event);
      return service.overrideMember(adminId, userId, body.action, body.grace_days);
    }

    throw new NotFoundError('Admin route not found');
  };
}
