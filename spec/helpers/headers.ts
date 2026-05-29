import { TestConfig } from './config';

export type ParseHeaders = Record<string, string>;

export interface AuthOptions {
  masterKey?: boolean;
  maintenanceKey?: boolean;
  restAPIKey?: boolean;
  clientKey?: boolean;
  javascriptKey?: boolean;
  sessionToken?: string;
  /** Default true; sets Content-Type: application/json so nested bodies survive. */
  json?: boolean;
}

/**
 * Build the X-Parse-* headers for a REST request from a set of auth options.
 * Always includes the application id; other keys are opt-in.
 */
export function buildHeaders(auth: AuthOptions = {}): ParseHeaders {
  const headers: ParseHeaders = { 'X-Parse-Application-Id': TestConfig.appId };
  if (auth.json !== false) headers['Content-Type'] = 'application/json';
  if (auth.masterKey) headers['X-Parse-Master-Key'] = TestConfig.masterKey;
  if (auth.maintenanceKey) headers['X-Parse-Maintenance-Key'] = TestConfig.masterKey;
  if (auth.restAPIKey) headers['X-Parse-REST-API-Key'] = TestConfig.restAPIKey;
  if (auth.clientKey) headers['X-Parse-Client-Key'] = TestConfig.clientKey;
  if (auth.javascriptKey) headers['X-Parse-JavaScript-Key'] = TestConfig.javascriptKey;
  if (auth.sessionToken) headers['X-Parse-Session-Token'] = auth.sessionToken;
  return headers;
}
