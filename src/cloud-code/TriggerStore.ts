/**
 * TriggerStore — per-app registry for cloud code hooks.
 *
 * Pure storage: no conversion, no validation, no SDK logic.
 * Each app gets an isolated store keyed by appId.
 */

import { validateClassNameForTriggers } from './validateTrigger';

const logging = require('../logger');
const Config = require('../Config');

// ── Constants ─────────────────────────────────────────────────────────

export const TriggerType = {
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind',
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforePasswordResetRequest: 'beforePasswordResetRequest',
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent',
} as const;

export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

export const HookType = {
  function: 'function',
  job: 'job',
} as const;

export type HookType = (typeof HookType)[keyof typeof HookType];

// ── Types ─────────────────────────────────────────────────────────────

export type CloudHandler = (...args: unknown[]) => unknown;
export type ValidatorOption = ((...args: unknown[]) => unknown) | Record<string, unknown>;

const CONNECT_CLASS_NAME = '@Connect';
const INVALID_NAME_PATTERN = /['"`]/;

// ── Per-app store ─────────────────────────────────────────────────────

interface AppHookStore {
  functions: Map<string, CloudHandler>;
  jobs: Map<string, CloudHandler>;
  triggers: Map<string, CloudHandler>;
  validators: Map<string, ValidatorOption>;
  liveQueryHandlers: CloudHandler[];
}

function createAppHookStore(): AppHookStore {
  return {
    functions: new Map(),
    jobs: new Map(),
    triggers: new Map(),
    validators: new Map(),
    liveQueryHandlers: [],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function isValidHookName(name: string): boolean {
  return !INVALID_NAME_PATTERN.test(name);
}

function triggerKey(type: string, className: string): string {
  return `${type}.${className}`;
}

function updateValidator(
  validators: Map<string, ValidatorOption>,
  key: string,
  validator?: ValidatorOption
): void {
  if (validator) {
    validators.set(key, validator);
  } else {
    validators.delete(key);
  }
}

function unregisterRateLimiters(appId: string): void {
  Config.get(appId)?.unregisterRateLimiters();
}

// ── TriggerStore ──────────────────────────────────────────────────────

export class TriggerStore {
  private static stores: Map<string, AppHookStore> = new Map();

  private constructor() {}

  private static getOrCreateStore(appId: string): AppHookStore {
    let store = TriggerStore.stores.get(appId);
    if (!store) {
      store = createAppHookStore();
      TriggerStore.stores.set(appId, store);
    }
    return store;
  }

  // ── Functions ───────────────────────────────────────────────────────

  static addFunction(appId: string, name: string, handler: CloudHandler, validator?: ValidatorOption): void {
    if (!isValidHookName(name)) return;
    const store = TriggerStore.getOrCreateStore(appId);
    if (store.functions.has(name)) {
      logging.logger.warn(
        `Warning: Duplicate cloud functions exist for ${name}. Only the last one will be used and the others will be ignored.`
      );
    }
    store.functions.set(name, handler);
    updateValidator(store.validators, name, validator);
  }

  static getFunction(appId: string, name: string): CloudHandler | undefined {
    return TriggerStore.stores.get(appId)?.functions.get(name);
  }

  static getFunctionNames(appId: string): string[] {
    const store = TriggerStore.stores.get(appId);
    return store ? [...store.functions.keys()] : [];
  }

  static removeFunction(appId: string, name: string): void {
    const store = TriggerStore.stores.get(appId);
    if (store) {
      store.functions.delete(name);
      store.validators.delete(name);
    }
  }

  // ── Jobs ────────────────────────────────────────────────────────────

  static addJob(appId: string, name: string, handler: CloudHandler): void {
    if (!isValidHookName(name)) return;
    TriggerStore.getOrCreateStore(appId).jobs.set(name, handler);
  }

  static getJob(appId: string, name: string): CloudHandler | undefined {
    return TriggerStore.stores.get(appId)?.jobs.get(name);
  }

  static getJobs(appId: string): Record<string, CloudHandler> | undefined {
    const store = TriggerStore.stores.get(appId);
    if (!store || store.jobs.size === 0) return undefined;
    return Object.fromEntries(store.jobs);
  }

  // ── Triggers ────────────────────────────────────────────────────────

  static addTrigger(
    appId: string,
    type: string,
    className: string,
    handler: CloudHandler,
    validator?: ValidatorOption
  ): void {
    validateClassNameForTriggers(className, type);
    const store = TriggerStore.getOrCreateStore(appId);
    const key = triggerKey(type, className);
    store.triggers.set(key, handler);
    updateValidator(store.validators, key, validator);
  }

  static addConnectTrigger(appId: string, type: string, handler: CloudHandler, validator?: ValidatorOption): void {
    const store = TriggerStore.getOrCreateStore(appId);
    const key = triggerKey(type, CONNECT_CLASS_NAME);
    store.triggers.set(key, handler);
    updateValidator(store.validators, key, validator);
  }

  static getTrigger(appId: string, className: string, type: string): CloudHandler | undefined {
    return TriggerStore.stores.get(appId)?.triggers.get(triggerKey(type, className));
  }

  static triggerExists(appId: string, className: string, type: string): boolean {
    return TriggerStore.getTrigger(appId, className, type) !== undefined;
  }

  static removeTrigger(appId: string, type: string, className: string): void {
    const store = TriggerStore.stores.get(appId);
    if (store) {
      const key = triggerKey(type, className);
      store.triggers.delete(key);
      store.validators.delete(key);
    }
  }

  // ── Validators ──────────────────────────────────────────────────────

  static getValidator(appId: string, name: string): ValidatorOption | undefined {
    return TriggerStore.stores.get(appId)?.validators.get(name);
  }

  // ── Live Query ──────────────────────────────────────────────────────

  static addLiveQueryEventHandler(appId: string, handler: CloudHandler): void {
    TriggerStore.getOrCreateStore(appId).liveQueryHandlers.push(handler);
  }

  static runLiveQueryEventHandlers(appId: string, data: unknown): void {
    const store = TriggerStore.stores.get(appId);
    if (!store) return;
    for (const handler of store.liveQueryHandlers) {
      try {
        handler(data);
      } catch (error) {
        logging.logger.error(`liveQuery event handler failed for appId=${appId}:`, error);
      }
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  static removeAllHooks(appId: string): void {
    TriggerStore.stores.delete(appId);
    unregisterRateLimiters(appId);
  }

  static clearAll(): void {
    for (const appId of TriggerStore.stores.keys()) {
      unregisterRateLimiters(appId);
    }
    TriggerStore.stores.clear();
  }
}
