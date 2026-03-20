/**
 * CloudCodeRegistrar defines the contract for registering cloud code hooks.
 *
 * Parse Server creates one during startup. BYO SDKs implement this to
 * register their own hooks without depending on parse/node.
 *
 * Usage from any JS SDK:
 *
 *   import { CloudCodeRegistrar, TriggerType } from 'parse-server/cloud';
 *   const registrar = CloudCodeRegistrar.getInstance('myAppId');
 *   registrar.define(HookType.function, 'hello', handler);
 *   registrar.defineTrigger(TriggerType.beforeSave, 'GameScore', handler);
 */

import type { TriggerHandlerMap, HookHandlerMap } from './types';

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

export abstract class CloudCodeRegistrar {
  private static _instances: Map<string, CloudCodeRegistrar> = new Map();

  abstract get appId(): string;

  abstract initialize(config: RegistrarConfig): void;

  /**
   * Register a cloud function or job.
   *
   * The handler type is derived from the `HookType` constant:
   * - `HookType.function` → `FunctionHandler<P>`
   * - `HookType.job`      → `JobHandler<P>`
   */
  abstract define<
    K extends HookType,
    P extends Record<string, unknown> = Record<string, unknown>,
  >(type: K, name: string, handler: HookHandlerMap<P>[K], validator?: unknown): void;

  /**
   * Register a trigger on a class (beforeSave, afterDelete, etc.),
   * a connect trigger (beforeConnect with className '@Connect'),
   * or a live query handler (afterEvent, beforeSubscribe, etc.).
   *
   * The handler type is derived from the `TriggerType` constant:
   * - `TriggerType.beforeSave`  → `ObjectTriggerHandler<T>`
   * - `TriggerType.beforeFind`  → `QueryTriggerHandler`
   * - `TriggerType.afterFind`   → `AfterFindHandler<T>`
   * - etc.
   */
  abstract defineTrigger<
    K extends TriggerType,
    T extends Record<string, unknown> = Record<string, unknown>,
  >(type: K, className: string, handler: TriggerHandlerMap<T>[K], validator?: unknown): void;

  /**
   * Remove all registered hooks.
   */
  abstract removeAllHooks(): void;

  static getInstance(appId: string): CloudCodeRegistrar {
    const instance = CloudCodeRegistrar._instances.get(appId);
    if (!instance) {
      throw new Error(`CloudCodeRegistrar not found for appId "${appId}".`);
    }
    return instance;
  }

  static setInstance(registrar: CloudCodeRegistrar): void {
    CloudCodeRegistrar._instances.set(registrar.appId, registrar);
  }

  static removeInstance(appId: string): void {
    CloudCodeRegistrar._instances.delete(appId);
  }

  static clearInstances(): void {
    CloudCodeRegistrar._instances.clear();
  }
}

export interface RegistrarConfig {
  appId: string;
  masterKey: string;
  javascriptKey?: string;
  serverURL: string;
}
