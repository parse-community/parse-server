/**
 * SDK-agnostic request/response contracts for Cloud Code handlers.
 *
 * These interfaces use only plain JSON — no Parse.Object, Parse.Query, or
 * any other SDK type. The conversion between parse-server internals and
 * these contracts is the registrar's responsibility (e.g. LegacyCloud
 * converts Parse.Object ↔ JSON).
 *
 * All request and handler types are generic so consumers can specify
 * their own object / params shapes and avoid type assertions:
 *
 *   cloud.beforeSave<GameScore>('GameScore', req => {
 *     if (req.object.score < 0) throw new Error('negative');
 *   });
 *
 * Handler types are derived from trigger/hook constants via mapped types,
 * so `defineTrigger(TriggerType.beforeFind, ...)` requires a
 * `QueryTriggerHandler` while `defineTrigger(TriggerType.beforeSave, ...)`
 * requires an `ObjectTriggerHandler<T>`.
 */

// ── Shared ─────────────────────────────────────────────────

export interface CloudRequestBase {
  triggerName: string;
  master: boolean;
  isReadOnly: boolean;
  ip: string;
  headers: Record<string, string>;
  user?: Record<string, unknown>;
  installationId?: string;
  context?: Record<string, unknown>;
}

// ── Query descriptor (replaces Parse.Query) ────────────────

export interface QueryDescriptor {
  className: string;
  where?: Record<string, unknown>;
  limit?: number;
  skip?: number;
  include?: string[];
  excludeKeys?: string[];
  keys?: string[];
  order?: string;
  hint?: unknown;
  comment?: string;
  explain?: boolean;
  readPreference?: string;
  includeReadPreference?: string;
  subqueryReadPreference?: string;
}

// ── Object triggers ────────────────────────────────────────

export interface ObjectTriggerRequest<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends CloudRequestBase {
  object: T;
  original?: T;
}

/** beforeSave handler can return a partial update or void. */
export type BeforeSaveResult<
  T extends Record<string, unknown> = Record<string, unknown>,
> = Partial<T> | void;

/** afterSave / beforeDelete / afterDelete return void. */
export type AfterTriggerResult = void;

// ── Query triggers ─────────────────────────────────────────

export interface QueryTriggerRequest extends CloudRequestBase {
  query: QueryDescriptor;
  count: boolean;
  isGet: boolean;
}

/** beforeFind handler returns modified QueryDescriptor or void. */
export type BeforeFindResult = QueryDescriptor | void;

export interface AfterFindRequest<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends CloudRequestBase {
  query: QueryDescriptor;
  objects: T[];
  isGet: boolean;
}

/** afterFind handler returns modified objects array or void. */
export type AfterFindResult<
  T extends Record<string, unknown> = Record<string, unknown>,
> = T[] | void;

// ── Cloud functions ────────────────────────────────────────

export interface FunctionRequest<
  P extends Record<string, unknown> = Record<string, unknown>,
> extends CloudRequestBase {
  params: P;
  functionName: string;
}

// ── Jobs ───────────────────────────────────────────────────

export interface JobRequest<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  params: P;
  headers: Record<string, string>;
  ip: string;
  jobName: string;
  message: (msg: string) => void;
}

// ── Handler types ──────────────────────────────────────────

export type FunctionHandler<
  P extends Record<string, unknown> = Record<string, unknown>,
> = (request: FunctionRequest<P>) => unknown;

export type JobHandler<
  P extends Record<string, unknown> = Record<string, unknown>,
> = (request: JobRequest<P>) => unknown;

export type ObjectTriggerHandler<
  T extends Record<string, unknown> = Record<string, unknown>,
> = (request: ObjectTriggerRequest<T>) => BeforeSaveResult<T> | AfterTriggerResult;

export type QueryTriggerHandler = (
  request: QueryTriggerRequest
) => BeforeFindResult;

export type AfterFindHandler<
  T extends Record<string, unknown> = Record<string, unknown>,
> = (request: AfterFindRequest<T>) => AfterFindResult<T>;

/** Union of all trigger handler types. */
export type TriggerHandler<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  | ObjectTriggerHandler<T>
  | QueryTriggerHandler
  | AfterFindHandler<T>;

// ── Handler maps (derive handler from trigger/hook constant) ──

/**
 * Maps each TriggerType string literal to its handler signature.
 *
 * Used by `defineTrigger` so the compiler picks the right handler
 * type from the trigger constant alone:
 *
 *   defineTrigger(TriggerType.beforeFind, 'X', req => {
 *     req.query;   // QueryTriggerRequest — no annotation needed
 *   });
 */
export interface TriggerHandlerMap<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  beforeSave: ObjectTriggerHandler<T>;
  afterSave: ObjectTriggerHandler<T>;
  beforeDelete: ObjectTriggerHandler<T>;
  afterDelete: ObjectTriggerHandler<T>;
  beforeFind: QueryTriggerHandler;
  afterFind: AfterFindHandler<T>;
  beforeLogin: ObjectTriggerHandler<T>;
  afterLogin: ObjectTriggerHandler<T>;
  afterLogout: ObjectTriggerHandler<T>;
  beforePasswordResetRequest: ObjectTriggerHandler<T>;
  beforeConnect: ObjectTriggerHandler<T>;
  beforeSubscribe: QueryTriggerHandler;
  afterEvent: ObjectTriggerHandler<T>;
}

/**
 * Maps each HookType string literal to its handler signature.
 *
 *   define(HookType.function, 'hello', req => {
 *     req.params;  // FunctionRequest — inferred
 *   });
 */
export interface HookHandlerMap<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  function: FunctionHandler<P>;
  job: JobHandler<P>;
}
