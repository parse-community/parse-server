import { Parse } from 'parse/node';
import type { WebhookResponse } from '../types';

export function requestToWebhookBody(request: any): Record<string, unknown> {
  const body: Record<string, unknown> = {
    master: request.master ?? false,
    ip: request.ip ?? '',
    headers: request.headers ?? {},
    installationId: request.installationId,
  };

  if (request.user) {
    body.user = typeof request.user.toJSON === 'function' ? request.user.toJSON() : request.user;
  }
  if (request.params !== undefined) body.params = request.params;
  if (request.jobId !== undefined) body.jobId = request.jobId;
  if (request.object) {
    body.object = typeof request.object.toJSON === 'function' ? request.object.toJSON() : request.object;
  }
  if (request.original) {
    body.original = typeof request.original.toJSON === 'function' ? request.original.toJSON() : request.original;
  }
  if (request.context !== undefined) body.context = request.context;
  if (request.query) {
    body.query = {
      className: request.query.className,
      where: request.query._where,
      limit: request.query._limit,
      skip: request.query._skip,
      include: request.query._include?.join(','),
      keys: request.query._keys?.join(','),
      order: request.query._order,
    };
  }
  if (request.count !== undefined) body.count = request.count;
  if (request.isGet !== undefined) body.isGet = request.isGet;
  if (request.file) body.file = request.file;
  if (request.fileSize !== undefined) body.fileSize = request.fileSize;
  if (request.event) body.event = request.event;
  if (request.requestId !== undefined) body.requestId = request.requestId;
  if (request.clients !== undefined) body.clients = request.clients;
  if (request.subscriptions !== undefined) body.subscriptions = request.subscriptions;

  return body;
}

export function webhookResponseToResult(response: WebhookResponse): unknown {
  if ('error' in response) {
    throw new Parse.Error(response.error.code, response.error.message);
  }
  return response.success;
}

export function applyBeforeSaveResponse(request: any, response: WebhookResponse): void {
  if ('error' in response) {
    throw new Parse.Error(response.error.code, response.error.message);
  }
  const result = response.success;
  if (typeof result === 'object' && result !== null && Object.keys(result).length === 0) {
    return;
  }
  if (typeof result === 'object' && result !== null) {
    const skipFields = ['objectId', 'createdAt', 'updatedAt', 'className'];
    for (const [key, value] of Object.entries(result)) {
      if (!skipFields.includes(key)) {
        request.object.set(key, value);
      }
    }
  }
}
