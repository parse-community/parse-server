import { restRequest } from './request';
import { AuthOptions } from './headers';

// Core object CRUD + query over the REST API. Defaults to REST API key auth;
// pass an explicit AuthOptions (e.g. { masterKey: true }) to override.
const DEFAULT_AUTH: AuthOptions = { restAPIKey: true };

export interface CreateResult {
  objectId: string;
  createdAt: string;
}

export interface UpdateResult {
  updatedAt: string;
}

export interface FindParams {
  where?: Record<string, unknown>;
  limit?: number;
  skip?: number;
  order?: string;
  keys?: string;
  include?: string;
}

/** POST /classes/:className — create one object. */
export async function createObject(
  className: string,
  data: Record<string, unknown>,
  auth: AuthOptions = DEFAULT_AUTH
): Promise<CreateResult> {
  const res = await restRequest<CreateResult>({
    method: 'POST',
    path: `classes/${className}`,
    body: data,
    auth,
  });
  return res.data as CreateResult;
}

/** Create several objects sequentially (deterministic), mirroring saveAll. */
export async function createObjects(
  className: string,
  objects: Array<Record<string, unknown>>,
  auth: AuthOptions = DEFAULT_AUTH
): Promise<CreateResult[]> {
  const results: CreateResult[] = [];
  for (const data of objects) {
    results.push(await createObject(className, data, auth));
  }
  return results;
}

/** GET /classes/:className/:objectId — fetch one object. */
export async function getObject<T = any>(
  className: string,
  objectId: string,
  auth: AuthOptions = DEFAULT_AUTH
): Promise<T> {
  const res = await restRequest<T>({
    method: 'GET',
    path: `classes/${className}/${objectId}`,
    auth,
  });
  return res.data as T;
}

/** PUT /classes/:className/:objectId — update one object. */
export async function updateObject(
  className: string,
  objectId: string,
  data: Record<string, unknown>,
  auth: AuthOptions = DEFAULT_AUTH
): Promise<UpdateResult> {
  const res = await restRequest<UpdateResult>({
    method: 'PUT',
    path: `classes/${className}/${objectId}`,
    body: data,
    auth,
  });
  return res.data as UpdateResult;
}

/**
 * Query objects. Uses POST with `_method: 'GET'` so complex `where` clauses are
 * sent in the body rather than the URL. Returns the results array.
 */
export async function find<T = any>(
  className: string,
  params: FindParams = {},
  auth: AuthOptions = DEFAULT_AUTH
): Promise<T[]> {
  const res = await restRequest<{ results: T[] }>({
    method: 'POST',
    path: `classes/${className}`,
    body: { ...params, _method: 'GET' },
    auth,
  });
  return (res.data as { results: T[] }).results;
}

/** Count matching objects (count=1, limit=0). Returns the count. */
export async function count(
  className: string,
  params: FindParams = {},
  auth: AuthOptions = DEFAULT_AUTH
): Promise<number> {
  const res = await restRequest<{ count: number }>({
    method: 'POST',
    path: `classes/${className}`,
    body: { ...params, count: 1, limit: 0, _method: 'GET' },
    auth,
  });
  return (res.data as { count: number }).count;
}
