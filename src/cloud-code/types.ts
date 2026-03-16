// src/cloud-code/types.ts

export const TriggerTypes = Object.freeze({
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforePasswordResetRequest: 'beforePasswordResetRequest',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind',
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent',
});

export type TriggerName = keyof typeof TriggerTypes;

export type CloudFunctionHandler = (request: any) => any;
export type CloudTriggerHandler = (request: any) => any;
export type CloudJobHandler = (request: any) => any;
export type LiveQueryHandler = (data: any) => void;
export type ValidatorHandler = Record<string, any> | ((request: any) => any);

export interface FunctionEntry {
  handler: CloudFunctionHandler;
  source: string;
  validator?: ValidatorHandler;
}

export interface TriggerEntry {
  handler: CloudTriggerHandler;
  source: string;
  validator?: ValidatorHandler;
}

export interface JobEntry {
  handler: CloudJobHandler;
  source: string;
}

export interface LiveQueryEntry {
  handler: LiveQueryHandler;
  source: string;
}

export interface HookStore {
  functions: Map<string, FunctionEntry>;
  triggers: Map<string, TriggerEntry>;
  jobs: Map<string, JobEntry>;
  liveQueryHandlers: LiveQueryEntry[];
}

export interface ParseServerConfig {
  appId: string;
  masterKey: string;
  serverURL: string;
}

export interface CloudCodeRegistry {
  defineFunction(name: string, handler: CloudFunctionHandler, validator?: ValidatorHandler): void;
  defineTrigger(className: string, triggerName: TriggerName, handler: CloudTriggerHandler, validator?: ValidatorHandler): void;
  defineJob(name: string, handler: CloudJobHandler): void;
  defineLiveQueryHandler(handler: LiveQueryHandler): void;
}

export interface CloudCodeAdapter {
  readonly name: string;
  initialize(registry: CloudCodeRegistry, config: ParseServerConfig): Promise<void>;
  isHealthy(): Promise<boolean>;
  shutdown(): Promise<void>;
}

export interface CloudManifest {
  protocol: string;
  hooks: {
    functions: Array<{ name: string }>;
    triggers: Array<{ className: string; triggerName: string }>;
    jobs: Array<{ name: string }>;
  };
}

export type WebhookResponse =
  | { success: unknown }
  | { error: { code: number; message: string } };

export interface CloudRouter {
  getManifest(): CloudManifest;
  dispatchFunction(name: string, body: Record<string, unknown>): Promise<WebhookResponse>;
  dispatchTrigger(className: string, triggerName: string, body: Record<string, unknown>): Promise<WebhookResponse>;
  dispatchJob(name: string, body: Record<string, unknown>): Promise<WebhookResponse>;
}

export interface InProcessCloudCode {
  getRouter(): CloudRouter;
}

export interface CloudCodeOptions {
  startupTimeout?: number;
  healthCheckInterval?: number;
  shutdownTimeout?: number;
  maxRestartDelay?: number;
}
