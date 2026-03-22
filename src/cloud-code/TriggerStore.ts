/**
 * TriggerStore — singleton store for cloud code hooks, keyed by appId.
 *
 * All methods are static. Storage is created lazily per appId.
 * Pure storage — no conversion, no validation, no SDK logic.
 */

import { validateClassNameForTriggers } from './validateTrigger';

const logging = require('../logger');
const Config = require('../Config');

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

export type TriggerType = typeof TriggerType[keyof typeof TriggerType];

export const HookType = {
  function: 'function',
  job: 'job',
} as const;

export type HookType = typeof HookType[keyof typeof HookType];

const ConnectClassName = '@Connect';

// ── Types ────────────────────────────────────────────────────────────

export type Handler = (...args: unknown[]) => unknown;
export type Validator = Function | Record<string, unknown>;

/** Nested store: values are either handlers or sub-stores. */
interface HandlerStore {
  [key: string]: Handler | HandlerStore;
}

interface ValidatorStore {
  [key: string]: Validator | ValidatorStore;
}

// ── Helpers ──────────────────────────────────────────────────────────

function createHandlerStore(): HandlerStore {
  return Object.create(null);
}

function createValidatorStore(): ValidatorStore {
  return Object.create(null);
}

// ── Per-app data ─────────────────────────────────────────────────────

interface AppStore {
  functions: HandlerStore;
  jobs: HandlerStore;
  triggers: HandlerStore;
  validators: ValidatorStore;
  liveQuery: Handler[];
}

function createAppStore(): AppStore {
  const types = Object.keys(TriggerType);
  return {
    functions: createHandlerStore(),
    jobs: createHandlerStore(),
    triggers: types.reduce((base: HandlerStore, key: string) => {
      base[key] = createHandlerStore();
      return base;
    }, createHandlerStore()),
    validators: types.reduce((base: ValidatorStore, key: string) => {
      base[key] = createValidatorStore();
      return base;
    }, createValidatorStore()),
    liveQuery: [],
  };
}

// ── Store internals ──────────────────────────────────────────────────

const invalidNameRegex = /['"`]/;

function addToStore(store: HandlerStore, name: string, value: Handler): void;
function addToStore(store: ValidatorStore, name: string, value: Validator): void;
function addToStore(store: HandlerStore | ValidatorStore, name: string, value: Handler | Validator): void {
  if (invalidNameRegex.test(name)) return;
  const parts = name.split('.');
  const last = parts.pop()!;
  let current: Record<string, unknown> = store;
  for (const part of parts) {
    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      current[part] = Object.create(null);
    }
    current = current[part] as Record<string, unknown>;
  }
  if (current[last]) {
    logging.logger.warn(
      `Warning: Duplicate cloud functions exist for ${last}. Only the last one will be used and the others will be ignored.`
    );
  }
  current[last] = value;
}

function getFromStore(store: HandlerStore, name: string): Handler | undefined;
function getFromStore(store: ValidatorStore, name: string): Validator | undefined;
function getFromStore(store: HandlerStore | ValidatorStore, name: string): Handler | Validator | undefined {
  if (invalidNameRegex.test(name)) return undefined;
  const parts = name.split('.');
  const last = parts.pop()!;
  let current: Record<string, unknown> = store;
  for (const part of parts) {
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part] as Record<string, unknown>;
    if (!current) return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(current, last)) return undefined;
  return current[last] as Handler | Validator;
}

function removeFromStore(store: HandlerStore | ValidatorStore, name: string): void {
  if (invalidNameRegex.test(name)) return;
  const parts = name.split('.');
  const last = parts.pop()!;
  let current: Record<string, unknown> = store;
  for (const part of parts) {
    if (!Object.prototype.hasOwnProperty.call(current, part)) return;
    current = current[part] as Record<string, unknown>;
    if (!current) return;
  }
  delete current[last];
}

// ── TriggerStore ─────────────────────────────────────────────────────

export class TriggerStore {
  private static _stores: Map<string, AppStore> = new Map();

  private constructor() {}

  private static _getOrCreate(appId: string): AppStore {
    let store = TriggerStore._stores.get(appId);
    if (!store) {
      store = createAppStore();
      TriggerStore._stores.set(appId, store);
    }
    return store;
  }

  // ── Storage ────────────────────────────────────────────────────────

  static addFunction(appId: string, name: string, handler: Handler, validator?: Validator): void {
    const s = TriggerStore._getOrCreate(appId);
    addToStore(s.functions, name, handler);
    if (validator) {
      addToStore(s.validators, name, validator);
    } else {
      removeFromStore(s.validators, name);
    }
  }

  static addJob(appId: string, name: string, handler: Handler): void {
    addToStore(TriggerStore._getOrCreate(appId).jobs, name, handler);
  }

  static addTrigger(appId: string, type: string, className: string, handler: Handler, validator?: Validator): void {
    validateClassNameForTriggers(className, type);
    const s = TriggerStore._getOrCreate(appId);
    const key = `${type}.${className}`;
    addToStore(s.triggers, key, handler);
    if (validator) {
      addToStore(s.validators, key, validator);
    } else {
      removeFromStore(s.validators, key);
    }
  }

  static addConnectTrigger(appId: string, type: string, handler: Handler, validator?: Validator): void {
    const s = TriggerStore._getOrCreate(appId);
    const key = `${type}.${ConnectClassName}`;
    addToStore(s.triggers, key, handler);
    if (validator) {
      addToStore(s.validators, key, validator);
    } else {
      removeFromStore(s.validators, key);
    }
  }

  static addLiveQueryEventHandler(appId: string, handler: Handler): void {
    TriggerStore._getOrCreate(appId).liveQuery.push(handler);
  }

  // ── Retrieval ──────────────────────────────────────────────────────

  static getFunction(appId: string, name: string): Handler | undefined {
    const s = TriggerStore._stores.get(appId);
    return s ? getFromStore(s.functions, name) : undefined;
  }

  static getFunctionNames(appId: string): string[] {
    const s = TriggerStore._stores.get(appId);
    if (!s) return [];
    const names: string[] = [];
    const extract = (namespace: string | null, store: HandlerStore) => {
      Object.keys(store).forEach(name => {
        const fullName = namespace ? `${namespace}.${name}` : name;
        const value = store[name];
        if (typeof value === 'function') {
          names.push(fullName);
        } else {
          extract(fullName, value as HandlerStore);
        }
      });
    };
    extract(null, s.functions);
    return names;
  }

  static getJob(appId: string, name: string): Handler | undefined {
    const s = TriggerStore._stores.get(appId);
    return s ? getFromStore(s.jobs, name) : undefined;
  }

  static getJobs(appId: string): HandlerStore | undefined {
    const s = TriggerStore._stores.get(appId);
    if (!s || Object.keys(s.jobs).length === 0) return undefined;
    return s.jobs;
  }

  static getTrigger(appId: string, className: string, type: string): Handler | undefined {
    const s = TriggerStore._stores.get(appId);
    return s ? getFromStore(s.triggers, `${type}.${className}`) as Handler | undefined : undefined;
  }

  static triggerExists(appId: string, className: string, type: string): boolean {
    return TriggerStore.getTrigger(appId, className, type) != undefined;
  }

  static getValidator(appId: string, name: string): Validator | undefined {
    const s = TriggerStore._stores.get(appId);
    return s ? getFromStore(s.validators, name) : undefined;
  }

  // ── Removal ────────────────────────────────────────────────────────

  static removeFunction(appId: string, name: string): void {
    const s = TriggerStore._stores.get(appId);
    if (s) {
      removeFromStore(s.functions, name);
      removeFromStore(s.validators, name);
    }
  }

  static removeTrigger(appId: string, type: string, className: string): void {
    const s = TriggerStore._stores.get(appId);
    if (s) {
      removeFromStore(s.triggers, `${type}.${className}`);
      removeFromStore(s.validators, `${type}.${className}`);
    }
  }

  static removeAllHooks(appId: string): void {
    TriggerStore._stores.delete(appId);
    Config.get(appId)?.unregisterRateLimiters();
  }

  static clearAll(): void {
    for (const appId of TriggerStore._stores.keys()) {
      Config.get(appId)?.unregisterRateLimiters();
    }
    TriggerStore._stores.clear();
  }

  // ── Live query ─────────────────────────────────────────────────────

  static runLiveQueryEventHandlers(appId: string, data: unknown): void {
    const s = TriggerStore._stores.get(appId);
    if (s) {
      for (const handler of s.liveQuery) {
        try {
          handler(data);
        } catch (e) {
          logging.logger.error(`liveQuery event handler failed for appId=${appId}:`, e);
        }
      }
    }
  }
}
