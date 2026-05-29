import { TestConfig } from './config';
import { buildHeaders, AuthOptions, ParseHeaders } from './headers';

// Uses the global fetch (Node 18+). Reading `global.fetch` dynamically keeps the
// client compatible with spec/helper.js's mockFetch, which intercepts external
// URLs and passes our own server requests through to the real fetch.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ParseResponse<T = any> {
  status: number;
  headers: Record<string, string>;
  /** Parsed JSON body, or undefined when the response is empty / not JSON. */
  data: T | undefined;
  text: string;
}

export interface ParseErrorBody {
  code: number;
  error: string;
}

export interface RestRequest {
  method: HttpMethod;
  /** Path under the server, e.g. 'events/MyEvent' (leading slash optional). */
  path: string;
  body?: unknown;
  auth?: AuthOptions;
  /** Explicit header overrides; merged on top of the auth-derived headers. */
  headers?: ParseHeaders;
}

/** Error thrown for non-2xx responses; carries the parsed body and response. */
export interface ParseRequestError extends Error {
  status: number;
  data: ParseErrorBody | undefined;
  response: ParseResponse;
}

function url(path: string): string {
  return `${TestConfig.serverURL}/${path.replace(/^\//, '')}`;
}

/**
 * Make a REST request to the test server via fetch. Resolves with the typed
 * response on 2xx/3xx; rejects with a ParseRequestError on status < 200 || >= 400
 * (fetch itself only rejects on network errors, so we normalise that here).
 */
export async function restRequest<T = any>(req: RestRequest): Promise<ParseResponse<T>> {
  const headers = { ...buildHeaders(req.auth), ...(req.headers || {}) };
  const init: RequestInit = { method: req.method, headers };
  if (req.body !== undefined) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const res = await fetch(url(req.path), init);
  const text = await res.text();
  let data: T | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  const response: ParseResponse<T> = {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    data,
    text,
  };

  if (res.status < 200 || res.status >= 400) {
    const error = new Error(
      `Parse REST request failed with status ${res.status}`
    ) as ParseRequestError;
    error.status = res.status;
    error.data = data as ParseErrorBody | undefined;
    error.response = response;
    throw error;
  }

  return response;
}

/**
 * Assert that a request fails as a Parse error. Returns the parsed { code, error }
 * body so callers can make further assertions. Fails the spec if it succeeds.
 */
export async function expectParseError(
  promise: Promise<unknown>,
  code?: number
): Promise<ParseErrorBody> {
  try {
    await promise;
  } catch (e: any) {
    const body: ParseErrorBody = e && e.data ? e.data : e;
    if (code !== undefined) {
      expect(body.code).toBe(code);
    }
    return body;
  }
  throw new Error('Expected request to fail with a Parse error, but it succeeded');
}
