export var __esModule: boolean;
export function handleParseHeaders(req: any, res: any, next: any): void | Promise<void>;
export function allowCrossDomain(appId: any): (req: any, res: any, next: any) => void;
export function allowMethodOverride(req: any, res: any, next: any): void;
export function handleParseErrors(err: any, req: any, res: any, next: any): any;
export function enforceMasterKeyAccess(req: any, res: any, next: any): void;
export function promiseEnforceMasterKeyAccess(request: any): Promise<void>;
/**
 * Deduplicates a request to ensure idempotency. Duplicates are determined by the request ID
 * in the request header. If a request has no request ID, it is executed anyway.
 * @param {*} req The request to evaluate.
 * @returns Promise<{}>
 */
export function promiseEnsureIdempotency(req: any): any;
export const DEFAULT_ALLOWED_HEADERS: "X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control";
