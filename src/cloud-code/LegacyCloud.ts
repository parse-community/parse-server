/**
 * LegacyCloud — the built-in cloud SDK backed by parse/node.
 *
 * It wraps the Parse JS SDK and provides
 * the Parse.Cloud.* convenience methods (beforeSave, define, etc.) that
 * bypass the registrar's plain-data conversion — Parse.Cloud handlers
 * receive Parse.Object etc. directly.
 */

import { TriggerStore, TriggerType } from './TriggerStore';
import * as triggers from '../triggers';
import { addRateLimit } from '../middlewares';

const Config = require('../Config');

type CloudHandler = (...args: unknown[]) => unknown;
type Validator = Function | Record<string, unknown>;
type ParseClassArg = string | { className?: string; name?: string };

const ROUTE_MAP: Record<string, string> = {
  _User: 'users',
  _Session: 'sessions',
  '@File': 'files',
  '@Config': 'config',
};

function getRoute(parseClass: string): string {
  const route = ROUTE_MAP[parseClass];
  if (route) {
    if (parseClass === '@File') return `/${route}{/*id}`;
    return `/${route}`;
  }
  return `/classes/${parseClass}{/*id}`;
}

function isParseObjectConstructor(obj: unknown): boolean {
  return typeof obj === 'function' && Object.prototype.hasOwnProperty.call(obj, 'className');
}

function validateValidator(validator?: Validator): void {
  if (!validator || typeof validator === 'function') return;

  const fieldOptions: Record<string, unknown[]> = {
    type: ['Any'], constant: [Boolean], default: ['Any'],
    options: [Array, 'function', 'Any'], required: [Boolean], error: [String],
  };
  const allowedKeys: Record<string, unknown[]> = {
    requireUser: [Boolean], requireAnyUserRoles: [Array, 'function'],
    requireAllUserRoles: [Array, 'function'], requireMaster: [Boolean],
    validateMasterKey: [Boolean], skipWithMasterKey: [Boolean],
    requireUserKeys: [Array, Object], fields: [Array, Object], rateLimit: [Object],
  };

  const getType = (fn: unknown): string => {
    if (Array.isArray(fn)) return 'array';
    if (fn === 'Any' || fn === 'function') return fn as string;
    if (typeof fn === 'function') {
      const match = fn.toString().match(/^\s*function (\w+)/);
      return (match ? match[1] : 'function').toLowerCase();
    }
    return typeof fn;
  };

  const checkKey = (key: string, schema: Record<string, unknown[]>, value: unknown) => {
    const allowed = schema[key];
    if (!allowed) throw `${key} is not a supported parameter for Cloud Function validations.`;
    const types = allowed.map(t => getType(t));
    const actual = getType(value);
    if (!types.includes(actual) && !types.includes('Any')) {
      throw `Invalid type for Cloud Function validation key ${key}. Expected ${types.join('|')}, actual ${actual}`;
    }
  };

  const v = validator as Record<string, unknown>;
  for (const key in v) {
    checkKey(key, allowedKeys, v[key]);
    if ((key === 'fields' || key === 'requireUserKeys') && !Array.isArray(v[key])) {
      const nested = v[key] as Record<string, Record<string, unknown>>;
      for (const field in nested) {
        for (const subKey in nested[field]) {
          checkKey(subKey, fieldOptions, nested[field][subKey]);
        }
      }
    }
  }
}

export class LegacyCloud {
  private _appId: string = '';
  private _parse: any = null;

  get appId(): string {
    return this._appId;
  }

  get Parse(): any {
    return this._parse;
  }

  initialize(config: { appId: string; masterKey: string; javascriptKey?: string; serverURL: string }): void {
    this._appId = config.appId;
    this._parse = require('parse/node').Parse;
    this._parse.initialize(
      config.appId,
      config.javascriptKey || 'unused',
      config.masterKey
    );
    this._parse.serverURL = config.serverURL;
    (global as any).Parse = this._parse;
  }

  // ── Parse.Cloud convenience methods ──────────────────────────────────
  // These are bound onto Parse.Cloud by bindToParseCloud().
  // They call triggers directly — Parse.Cloud handlers receive
  // Parse.Object etc. without plain-data conversion.

  cloudDefine(name: string, handler: CloudHandler, validator?: Validator): void {
    validateValidator(validator);
    triggers.addFunction(name, handler, validator, this._appId);
    this.applyRateLimit(validator, { requestPath: `/functions/${name}` });
  }

  cloudJob(name: string, handler: CloudHandler): void {
    triggers.addJob(name, handler, this._appId);
  }

  cloudBeforeSave(parseClass: ParseClassArg, handler: CloudHandler, validator?: Validator): void {
    const className = triggers.getClassName(parseClass);
    this.cloudTrigger(TriggerType.beforeSave, className, handler, validator, ['POST', 'PUT']);
  }

  cloudAfterSave(parseClass: ParseClassArg, handler: CloudHandler, validator?: Validator): void {
    this.cloudTrigger(TriggerType.afterSave, triggers.getClassName(parseClass), handler, validator);
  }

  cloudBeforeDelete(parseClass: ParseClassArg, handler: CloudHandler, validator?: Validator): void {
    const className = triggers.getClassName(parseClass);
    this.cloudTrigger(TriggerType.beforeDelete, className, handler, validator, 'DELETE');
  }

  cloudAfterDelete(parseClass: ParseClassArg, handler: CloudHandler, validator?: Validator): void {
    this.cloudTrigger(TriggerType.afterDelete, triggers.getClassName(parseClass), handler, validator);
  }

  cloudBeforeFind(parseClass: ParseClassArg, handler: CloudHandler, validator?: Validator): void {
    const className = triggers.getClassName(parseClass);
    this.cloudTrigger(TriggerType.beforeFind, className, handler, validator, 'GET');
  }

  cloudAfterFind(parseClass: ParseClassArg, handler: CloudHandler, validator?: Validator): void {
    this.cloudTrigger(TriggerType.afterFind, triggers.getClassName(parseClass), handler, validator);
  }

  cloudBeforeLogin(...args: unknown[]): void {
    this.cloudAuthTrigger(TriggerType.beforeLogin, '_User', args, '/login', ['POST', 'GET']);
  }

  cloudAfterLogin(...args: unknown[]): void {
    this.cloudAuthTrigger(TriggerType.afterLogin, '_User', args);
  }

  cloudAfterLogout(...args: unknown[]): void {
    this.cloudAuthTrigger(TriggerType.afterLogout, '_Session', args);
  }

  cloudBeforePasswordResetRequest(...args: unknown[]): void {
    this.cloudAuthTrigger(TriggerType.beforePasswordResetRequest, '_User', args, '/requestPasswordReset', 'POST');
  }

  cloudBeforeConnect(handler: CloudHandler, validator?: Validator): void {
    validateValidator(validator);
    triggers.addConnectTrigger(TriggerType.beforeConnect, handler, this._appId, validator);
  }

  cloudBeforeSubscribe(parseClass: ParseClassArg, handler: CloudHandler, validator?: Validator): void {
    this.cloudTrigger(TriggerType.beforeSubscribe, triggers.getClassName(parseClass), handler, validator);
  }

  cloudOnLiveQueryEvent(handler: Function): void {
    triggers.addLiveQueryEventHandler(handler, this._appId);
  }

  cloudAfterLiveQueryEvent(parseClass: ParseClassArg, handler: CloudHandler, validator?: Validator): void {
    this.cloudTrigger(TriggerType.afterEvent, triggers.getClassName(parseClass), handler, validator);
  }

  cloudSendEmail(data: Record<string, unknown>): unknown {
    const config = Config.get(this._appId);
    const emailAdapter = config.userController.adapter;
    if (!emailAdapter) {
      config.loggerController.error('Failed to send email because no mail adapter is configured for Parse Server.');
      return;
    }
    return emailAdapter.sendMail(data);
  }

  cloudUseMasterKey(): void {
    console.warn(
      'Parse.Cloud.useMasterKey is deprecated (and has no effect anymore) on parse-server, please refer to the cloud code migration notes: http://docs.parseplatform.org/parse-server/guide/#master-key-must-be-passed-explicitly'
    );
  }

  /**
   * Bind Parse.Cloud methods onto the Parse SDK object.
   * Called by ParseServer during startup.
   */
  bindToParseCloud(): void {
    const Parse = this._parse;
    const ParseServerModule = require('./Parse.Server');

    Object.defineProperty(Parse, 'Server', {
      get: () => {
        const conf = Config.get(Parse.applicationId);
        return { ...conf, ...ParseServerModule };
      },
      set: (newVal: any) => {
        const existing = Config.get(Parse.applicationId) || {};
        const merged = { ...existing, ...newVal, appId: Parse.applicationId };
        Config.put(merged);
      },
      configurable: true,
    });

    const bindings: Record<string, string> = {
      define: 'cloudDefine',
      job: 'cloudJob',
      beforeSave: 'cloudBeforeSave',
      afterSave: 'cloudAfterSave',
      beforeDelete: 'cloudBeforeDelete',
      afterDelete: 'cloudAfterDelete',
      beforeFind: 'cloudBeforeFind',
      afterFind: 'cloudAfterFind',
      beforeLogin: 'cloudBeforeLogin',
      afterLogin: 'cloudAfterLogin',
      afterLogout: 'cloudAfterLogout',
      beforePasswordResetRequest: 'cloudBeforePasswordResetRequest',
      beforeConnect: 'cloudBeforeConnect',
      beforeSubscribe: 'cloudBeforeSubscribe',
      onLiveQueryEvent: 'cloudOnLiveQueryEvent',
      afterLiveQueryEvent: 'cloudAfterLiveQueryEvent',
      sendEmail: 'cloudSendEmail',
      useMasterKey: 'cloudUseMasterKey',
    };

    for (const [cloudName, legacyName] of Object.entries(bindings)) {
      Parse.Cloud[cloudName] = (this as any)[legacyName].bind(this);
    }

    Parse.Cloud._removeAllHooks = () => TriggerStore.removeAllHooks(this._appId);
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private cloudTrigger(
    type: TriggerType,
    className: string,
    handler: CloudHandler,
    validator?: Validator,
    requestMethods?: string | string[]
  ): void {
    validateValidator(validator);
    triggers.addTrigger(type, className, handler, this._appId, validator);
    if (requestMethods) {
      this.applyRateLimit(validator, { requestPath: getRoute(className), requestMethods });
    }
  }

  private cloudAuthTrigger(
    type: TriggerType,
    defaultClass: string,
    args: unknown[],
    rateLimitPath?: string,
    rateLimitMethod?: string | string[]
  ): void {
    let handler = args[0] as CloudHandler;
    let validator = args[1] as Validator | undefined;
    let className = defaultClass;

    if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
      className = triggers.getClassName(handler);
      handler = args[1] as CloudHandler;
      validator = args.length >= 3 ? (args[2] as Validator) : undefined;
    }

    validateValidator(validator);
    triggers.addTrigger(type, className, handler, this._appId, validator);

    if (rateLimitPath) {
      this.applyRateLimit(validator, { requestPath: rateLimitPath, requestMethods: rateLimitMethod });
    }
  }

  private applyRateLimit(
    validator: Validator | undefined,
    route: { requestPath: string; requestMethods?: string | string[] }
  ): void {
    if (!validator || typeof validator !== 'object') return;
    const v = validator as Record<string, unknown>;
    if (!v.rateLimit) return;
    addRateLimit(
      { ...route, ...(v.rateLimit as Record<string, unknown>) },
      this._appId,
      true
    );
  }
}
