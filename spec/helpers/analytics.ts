import { restRequest } from './request.ts';
import type { ParseResponse } from './request.ts';
import type { AuthOptions } from './headers.ts';

export type Dimensions = Record<string, string>;

/** POST /events/:eventName with a { dimensions } body. Defaults to REST API key auth. */
export function track(
  eventName: string,
  dimensions: Dimensions,
  auth: AuthOptions = { restAPIKey: true }
): Promise<ParseResponse> {
  return restRequest({
    method: 'POST',
    path: `events/${encodeURIComponent(eventName)}`,
    body: { dimensions },
    auth,
  });
}

/** POST /events/AppOpened with a { dimensions } body (reserved event route). */
export function appOpened(
  dimensions: Dimensions,
  auth: AuthOptions = { restAPIKey: true }
): Promise<ParseResponse> {
  return track('AppOpened', dimensions, auth);
}
