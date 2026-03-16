# Cloud Code Adapter Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `triggers.js` with a `CloudCodeManager` that supports composable adapters (Legacy, InProcess, ExternalProcess, BYO), enabling multi-language cloud code without breaking existing Parse Server users.

**Architecture:** One `CloudCodeManager` per `applicationId`, stored on `this.config` (which flows into `AppCache` via `Config.put()`). The manager owns hook registration (with conflict detection), lookup, and execution. Three built-in adapters cover existing use cases. `triggers.js` becomes a facade that delegates both reads AND writes to `CloudCodeManager` when one exists, preserving all existing `Parse.Cloud.js` behavior (validators, rate limiting, auth trigger argument parsing) without reimplementing it.

**Tech Stack:** TypeScript, Babel (transpiles `.ts` via `@babel/preset-typescript`), Jasmine tests, Parse JS SDK

**Spec:** `docs/superpowers/specs/2026-03-16-cloud-code-adapter-design.md`

**Target User Experience (`@parse-lite/cloud`):**

```typescript
import ParseServer from 'parse-server';
import { ParseCloud } from '@parse-lite/cloud';

const cloud = new ParseCloud();
cloud.class<Todo>('Todo')
  .requireUser()
  .beforeSave(async ({ object, isNew, user }) => {
    if (isNew) object.authorId = user!.objectId;
    return object;
  });
cloud.function('getStats').requireMaster().handle(async () => ({ total: 42 }));

new ParseServer({
  databaseURI: 'mongodb://localhost:27017/myapp',
  appId: 'myapp',
  masterKey: 'secret',
  cloud: cloud,  // ← ParseCloud has getRouter(), detected as InProcessAdapter
});
```

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/cloud-code/types.ts` | TypeScript interfaces: `CloudCodeAdapter`, `CloudCodeRegistry`, `HookStore`, `TriggerName`, handler types, config types |
| `src/cloud-code/CloudCodeManager.ts` | Core manager: adapter lifecycle, hook store, registration with conflict detection, lookup, execution |
| `src/cloud-code/adapters/LegacyAdapter.ts` | Loads user cloud code file (delegates to existing `Parse.Cloud.js` → `triggers.js` facade → manager) |
| `src/cloud-code/adapters/InProcessAdapter.ts` | Duck-typed `getRouter()` integration, manifest-based registration, webhook body bridge |
| `src/cloud-code/adapters/ExternalProcessAdapter.ts` | Child process lifecycle, ParseCloud/1.0 protocol, health monitoring |
| `src/cloud-code/adapters/webhook-bridge.ts` | `requestToWebhookBody()` and `webhookResponseToResult()` shared by InProcess and External adapters |
| `spec/CloudCodeManager.spec.js` | Unit tests for CloudCodeManager |
| `spec/InProcessAdapter.spec.js` | Tests for InProcessAdapter with mock router |
| `spec/ExternalProcessAdapter.spec.js` | Tests for ExternalProcessAdapter lifecycle |
| `spec/CloudCodeAdapter.integration.spec.js` | Integration tests for composable adapters |

### Modified Files

| File | Change |
|------|--------|
| `src/triggers.js` | Becomes facade: all `add*`/`get*`/`remove*` functions delegate to `CloudCodeManager` via `AppCache` when one exists |
| `src/ParseServer.ts` | Initialize `CloudCodeManager` with resolved adapters during `start()`, store on `AppCache` |
| `src/Options/index.js` | Add `cloudCodeCommand`, `webhookKey`, `cloudCodeOptions`, `cloudCodeAdapters` types |
| `src/Options/Definitions.js` | Add option definitions for new config fields |

### Key Architectural Decision: LegacyAdapter Does NOT Patch Parse.Cloud

The LegacyAdapter simply loads the user's cloud code file. `Parse.Cloud.define()`, `Parse.Cloud.beforeSave()`, etc. continue to call `triggers.addFunction()`, `triggers.addTrigger()` exactly as they do today. The facade in `triggers.js` intercepts these writes and delegates to `CloudCodeManager.defineFunction()` / `CloudCodeManager.defineTrigger()`.

This approach:
- Preserves `validateValidator()` and `addRateLimit()` calls in `Parse.Cloud.js` without reimplementation
- Preserves complex auth trigger argument parsing (`beforeLogin` can be called with or without className)
- Preserves `getClassName()` / `getRoute()` / `isParseObjectConstructor()` logic
- Eliminates a whole class of patching/restore bugs

---

## Chunk 1: Types and CloudCodeManager Core

### Task 1: Define TypeScript Interfaces

**Files:**
- Create: `src/cloud-code/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/cloud-code/types.ts

// --- Trigger Types (mirrors existing Types object in triggers.js) ---

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

// --- Handler Types ---

export type CloudFunctionHandler = (request: any) => any;
export type CloudTriggerHandler = (request: any) => any;
export type CloudJobHandler = (request: any) => any;
export type LiveQueryHandler = (data: any) => void;
export type ValidatorHandler = Record<string, any> | ((request: any) => any);

// --- Hook Store ---

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

// --- Server Config ---

export interface ParseServerConfig {
  appId: string;
  masterKey: string;
  serverURL: string;
}

// --- Registry (scoped per-adapter) ---

export interface CloudCodeRegistry {
  defineFunction(name: string, handler: CloudFunctionHandler, validator?: ValidatorHandler): void;
  defineTrigger(className: string, triggerName: TriggerName, handler: CloudTriggerHandler, validator?: ValidatorHandler): void;
  defineJob(name: string, handler: CloudJobHandler): void;
  defineLiveQueryHandler(handler: LiveQueryHandler): void;
}

// --- Adapter Interface ---

export interface CloudCodeAdapter {
  readonly name: string;
  initialize(registry: CloudCodeRegistry, config: ParseServerConfig): Promise<void>;
  isHealthy(): Promise<boolean>;
  shutdown(): Promise<void>;
}

// --- InProcess duck-typed interface ---

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

// --- External Process Options ---

export interface CloudCodeOptions {
  startupTimeout?: number;
  healthCheckInterval?: number;
  shutdownTimeout?: number;
  maxRestartDelay?: number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -f src/cloud-code/types.ts
git commit -m "feat: add TypeScript types for Cloud Code Adapter system"
```

---

### Task 2: CloudCodeManager — Registration, Conflict Detection, Lookup

**Files:**
- Create: `src/cloud-code/CloudCodeManager.ts`
- Test: `spec/CloudCodeManager.spec.js`

- [ ] **Step 1: Write failing tests**

```javascript
// spec/CloudCodeManager.spec.js
const { CloudCodeManager } = require('../lib/cloud-code/CloudCodeManager');

describe('CloudCodeManager', () => {
  let manager;

  beforeEach(() => {
    manager = new CloudCodeManager();
  });

  describe('createRegistry', () => {
    it('creates a scoped registry for an adapter', () => {
      const registry = manager.createRegistry('test-adapter');
      expect(registry.defineFunction).toBeDefined();
      expect(registry.defineTrigger).toBeDefined();
      expect(registry.defineJob).toBeDefined();
      expect(registry.defineLiveQueryHandler).toBeDefined();
    });
  });

  describe('defineFunction', () => {
    it('registers a cloud function', () => {
      const handler = () => {};
      manager.defineFunction('test', 'hello', handler);
      expect(manager.getFunction('hello')).toBe(handler);
    });

    it('throws on duplicate function from different source', () => {
      manager.defineFunction('adapter-a', 'hello', () => {});
      expect(() => {
        manager.defineFunction('adapter-b', 'hello', () => {});
      }).toThrowError(/Cloud code conflict.*hello.*adapter-a.*adapter-b/);
    });

    it('allows re-registration from same source (overwrite)', () => {
      const handler1 = () => 'first';
      const handler2 = () => 'second';
      manager.defineFunction('test', 'hello', handler1);
      manager.defineFunction('test', 'hello', handler2);
      expect(manager.getFunction('hello')).toBe(handler2);
    });

    it('supports namespaced function names', () => {
      const handler = () => {};
      manager.defineFunction('test', 'ns.sub.func', handler);
      expect(manager.getFunction('ns.sub.func')).toBe(handler);
    });
  });

  describe('defineTrigger', () => {
    it('registers a trigger', () => {
      const handler = () => {};
      manager.defineTrigger('test', 'Todo', 'beforeSave', handler);
      expect(manager.getTrigger('Todo', 'beforeSave')).toBe(handler);
    });

    it('throws on duplicate trigger from different source', () => {
      manager.defineTrigger('adapter-a', 'Todo', 'beforeSave', () => {});
      expect(() => {
        manager.defineTrigger('adapter-b', 'Todo', 'beforeSave', () => {});
      }).toThrowError(/Cloud code conflict.*beforeSave.*Todo.*adapter-a.*adapter-b/);
    });

    it('rejects beforeSave on _PushStatus', () => {
      expect(() => {
        manager.defineTrigger('test', '_PushStatus', 'beforeSave', () => {});
      }).toThrowError();
    });

    it('allows afterSave on _PushStatus', () => {
      expect(() => {
        manager.defineTrigger('test', '_PushStatus', 'afterSave', () => {});
      }).not.toThrow();
    });

    it('allows beforeLogin only on _User', () => {
      expect(() => {
        manager.defineTrigger('test', 'Todo', 'beforeLogin', () => {});
      }).toThrowError();
      expect(() => {
        manager.defineTrigger('test', '_User', 'beforeLogin', () => {});
      }).not.toThrow();
    });

    it('rejects all triggers on _Session except afterLogout', () => {
      expect(() => {
        manager.defineTrigger('test', '_Session', 'beforeSave', () => {});
      }).toThrowError(/Only the afterLogout trigger/);
      expect(() => {
        manager.defineTrigger('test', '_Session', 'afterLogout', () => {});
      }).not.toThrow();
    });

    it('uses virtual className @File for file triggers', () => {
      const handler = () => {};
      manager.defineTrigger('test', '@File', 'beforeSave', handler);
      expect(manager.getTrigger('@File', 'beforeSave')).toBe(handler);
    });

    it('uses virtual className @Connect for connect triggers', () => {
      const handler = () => {};
      manager.defineTrigger('test', '@Connect', 'beforeConnect', handler);
      expect(manager.getTrigger('@Connect', 'beforeConnect')).toBe(handler);
    });
  });

  describe('defineJob', () => {
    it('registers a job', () => {
      const handler = () => {};
      manager.defineJob('test', 'myJob', handler);
      expect(manager.getJob('myJob')).toBe(handler);
    });

    it('throws on duplicate job from different source', () => {
      manager.defineJob('adapter-a', 'myJob', () => {});
      expect(() => {
        manager.defineJob('adapter-b', 'myJob', () => {});
      }).toThrowError(/Cloud code conflict/);
    });
  });

  describe('lookup methods', () => {
    it('getFunctionNames returns all registered names', () => {
      manager.defineFunction('test', 'a', () => {});
      manager.defineFunction('test', 'b', () => {});
      manager.defineFunction('test', 'c', () => {});
      expect(manager.getFunctionNames().sort()).toEqual(['a', 'b', 'c']);
    });

    it('getJobs returns all jobs as a Map', () => {
      const h1 = () => {};
      const h2 = () => {};
      manager.defineJob('test', 'job1', h1);
      manager.defineJob('test', 'job2', h2);
      const jobs = manager.getJobs();
      expect(jobs.get('job1')).toBe(h1);
      expect(jobs.get('job2')).toBe(h2);
    });

    it('getJobsObject returns plain object (for facade compat)', () => {
      const h1 = () => {};
      manager.defineJob('test', 'job1', h1);
      const jobs = manager.getJobsObject();
      expect(jobs['job1']).toBe(h1);
    });

    it('triggerExists returns boolean', () => {
      manager.defineTrigger('test', 'Todo', 'beforeSave', () => {});
      expect(manager.triggerExists('Todo', 'beforeSave')).toBe(true);
      expect(manager.triggerExists('Todo', 'afterSave')).toBe(false);
    });

    it('getFunction returns undefined for unregistered', () => {
      expect(manager.getFunction('nonexistent')).toBeUndefined();
    });

    it('getTrigger returns undefined for unregistered', () => {
      expect(manager.getTrigger('Todo', 'beforeSave')).toBeUndefined();
    });
  });

  describe('validators', () => {
    it('getValidator returns validator for function', () => {
      const validator = { requireUser: true };
      manager.defineFunction('test', 'secured', () => {}, validator);
      expect(manager.getValidator('secured')).toEqual(validator);
    });

    it('getValidator returns validator for trigger (key format: triggerType.className)', () => {
      const validator = { requireMaster: true };
      manager.defineTrigger('test', 'Todo', 'beforeSave', () => {}, validator);
      expect(manager.getValidator('beforeSave.Todo')).toEqual(validator);
    });

    it('getValidator returns undefined when no validator set', () => {
      manager.defineFunction('test', 'noValidator', () => {});
      expect(manager.getValidator('noValidator')).toBeUndefined();
    });
  });

  describe('unregisterAll', () => {
    it('removes all hooks from a source', () => {
      manager.defineFunction('adapter-a', 'fn1', () => {});
      manager.defineFunction('adapter-b', 'fn2', () => {});
      manager.defineTrigger('adapter-a', 'Todo', 'beforeSave', () => {});
      manager.defineJob('adapter-a', 'job1', () => {});

      manager.unregisterAll('adapter-a');

      expect(manager.getFunction('fn1')).toBeUndefined();
      expect(manager.getFunction('fn2')).toBeDefined();
      expect(manager.getTrigger('Todo', 'beforeSave')).toBeUndefined();
      expect(manager.getJob('job1')).toBeUndefined();
    });

    it('removes live query handlers from a source', () => {
      let callCount = 0;
      manager.defineLiveQueryHandler('keep', () => { callCount++; });
      manager.defineLiveQueryHandler('remove', () => { callCount += 100; });

      manager.unregisterAll('remove');
      manager.runLiveQueryEventHandlers({});

      expect(callCount).toBe(1);
    });
  });

  describe('defineLiveQueryHandler', () => {
    it('registers and executes handlers synchronously', () => {
      const calls = [];
      manager.defineLiveQueryHandler('a', (data) => calls.push(['a', data]));
      manager.defineLiveQueryHandler('b', (data) => calls.push(['b', data]));

      manager.runLiveQueryEventHandlers({ event: 'test' });

      expect(calls).toEqual([['a', { event: 'test' }], ['b', { event: 'test' }]]);
    });
  });

  describe('registry scoping', () => {
    it('registry calls use the adapter name as source', () => {
      const registry = manager.createRegistry('my-adapter');
      registry.defineFunction('hello', () => {});

      expect(() => {
        manager.defineFunction('other-adapter', 'hello', () => {});
      }).toThrowError(/my-adapter.*other-adapter/);
    });
  });

  describe('lifecycle', () => {
    it('initialize calls each adapter in order', async () => {
      const order = [];
      const makeAdapter = (name) => ({
        name,
        async initialize(registry) { order.push(name); },
        async isHealthy() { return true; },
        async shutdown() {},
      });

      await manager.initialize(
        [makeAdapter('first'), makeAdapter('second')],
        { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' }
      );

      expect(order).toEqual(['first', 'second']);
    });

    it('rejects duplicate adapter names', async () => {
      const adapter = {
        name: 'dupe',
        async initialize() {},
        async isHealthy() { return true; },
        async shutdown() {},
      };

      await expectAsync(
        manager.initialize([adapter, adapter], { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' })
      ).toBeRejectedWithError(/Duplicate adapter name/);
    });

    it('shutdown calls each adapter and clears store', async () => {
      let shutdownCalled = false;
      const adapter = {
        name: 'test',
        async initialize(registry) {
          registry.defineFunction('fn', () => {});
        },
        async isHealthy() { return true; },
        async shutdown() { shutdownCalled = true; },
      };

      await manager.initialize([adapter], { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });
      expect(manager.getFunction('fn')).toBeDefined();

      await manager.shutdown();
      expect(shutdownCalled).toBe(true);
      expect(manager.getFunction('fn')).toBeUndefined();
    });

    it('healthCheck returns status per adapter', async () => {
      const healthy = { name: 'ok', async initialize() {}, async isHealthy() { return true; }, async shutdown() {} };
      const unhealthy = { name: 'bad', async initialize() {}, async isHealthy() { return false; }, async shutdown() {} };

      await manager.initialize([healthy, unhealthy], { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });
      const results = await manager.healthCheck();

      expect(results.get('ok')).toBe(true);
      expect(results.get('bad')).toBe(false);
    });
  });

  describe('removeFunction / removeTrigger', () => {
    it('removeFunction removes a registered function', () => {
      manager.defineFunction('test', 'fn', () => {});
      expect(manager.getFunction('fn')).toBeDefined();
      manager.removeFunction('fn');
      expect(manager.getFunction('fn')).toBeUndefined();
    });

    it('removeTrigger removes a registered trigger', () => {
      manager.defineTrigger('test', 'Todo', 'beforeSave', () => {});
      expect(manager.getTrigger('Todo', 'beforeSave')).toBeDefined();
      manager.removeTrigger('beforeSave', 'Todo');
      expect(manager.getTrigger('Todo', 'beforeSave')).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && TESTING=1 npx jasmine spec/CloudCodeManager.spec.js`
Expected: FAIL — `CloudCodeManager` module not found

- [ ] **Step 3: Implement CloudCodeManager**

```typescript
// src/cloud-code/CloudCodeManager.ts
import type {
  CloudCodeAdapter,
  CloudCodeRegistry,
  CloudFunctionHandler,
  CloudTriggerHandler,
  CloudJobHandler,
  LiveQueryHandler,
  ValidatorHandler,
  HookStore,
  ParseServerConfig,
} from './types';

const USER_ONLY_TRIGGERS = ['beforeLogin', 'afterLogin', 'beforePasswordResetRequest'];
const SESSION_ONLY_TRIGGERS = ['afterLogout'];

function validateClassNameForTrigger(className: string, triggerName: string): void {
  // Only afterSave is allowed on _PushStatus
  if (className === '_PushStatus' && triggerName === 'beforeSave') {
    throw new Error(`Triggers are not allowed for class _PushStatus: ${triggerName}. Only afterSave is allowed.`);
  }
  // Only afterLogout is allowed on _Session
  if (className === '_Session' && triggerName !== 'afterLogout') {
    throw new Error('Only the afterLogout trigger is allowed for the _Session class.');
  }
  // Auth triggers only on _User
  if (USER_ONLY_TRIGGERS.includes(triggerName) && className !== '_User') {
    throw new Error(`${triggerName} trigger is only allowed on _User class`);
  }
  if (SESSION_ONLY_TRIGGERS.includes(triggerName) && className !== '_Session') {
    throw new Error(`${triggerName} trigger is only allowed on _Session class`);
  }
}

function triggerKey(className: string, triggerName: string): string {
  return `${triggerName}.${className}`;
}

export class CloudCodeManager {
  private adapters: Map<string, CloudCodeAdapter> = new Map();
  private store: HookStore = {
    functions: new Map(),
    triggers: new Map(),
    jobs: new Map(),
    liveQueryHandlers: [],
  };

  // --- Lifecycle ---

  async initialize(adapters: CloudCodeAdapter[], serverConfig: ParseServerConfig): Promise<void> {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.name)) {
        throw new Error(`Duplicate adapter name: '${adapter.name}'`);
      }
      this.adapters.set(adapter.name, adapter);
      const registry = this.createRegistry(adapter.name);
      await adapter.initialize(registry, serverConfig);
    }
  }

  async shutdown(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.shutdown();
    }
    this.adapters.clear();
    this.store.functions.clear();
    this.store.triggers.clear();
    this.store.jobs.clear();
    this.store.liveQueryHandlers.length = 0;
  }

  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [name, adapter] of this.adapters) {
      try {
        results.set(name, await adapter.isHealthy());
      } catch {
        results.set(name, false);
      }
    }
    return results;
  }

  // --- Registry Factory ---

  createRegistry(source: string): CloudCodeRegistry {
    return {
      defineFunction: (name, handler, validator?) => {
        this.defineFunction(source, name, handler, validator);
      },
      defineTrigger: (className, triggerName, handler, validator?) => {
        this.defineTrigger(source, className, triggerName, handler, validator);
      },
      defineJob: (name, handler) => {
        this.defineJob(source, name, handler);
      },
      defineLiveQueryHandler: (handler) => {
        this.defineLiveQueryHandler(source, handler);
      },
    };
  }

  // --- Registration ---

  defineFunction(source: string, name: string, handler: CloudFunctionHandler, validator?: ValidatorHandler): void {
    const existing = this.store.functions.get(name);
    if (existing && existing.source !== source) {
      throw new Error(
        `Cloud code conflict: function '${name}' registered by both '${existing.source}' and '${source}'`
      );
    }
    this.store.functions.set(name, { handler, source, validator });
  }

  defineTrigger(source: string, className: string, triggerName: string, handler: CloudTriggerHandler, validator?: ValidatorHandler): void {
    validateClassNameForTrigger(className, triggerName);
    const key = triggerKey(className, triggerName);
    const existing = this.store.triggers.get(key);
    if (existing && existing.source !== source) {
      throw new Error(
        `Cloud code conflict: ${triggerName} on '${className}' registered by both '${existing.source}' and '${source}'`
      );
    }
    this.store.triggers.set(key, { handler, source, validator });
  }

  defineJob(source: string, name: string, handler: CloudJobHandler): void {
    const existing = this.store.jobs.get(name);
    if (existing && existing.source !== source) {
      throw new Error(
        `Cloud code conflict: job '${name}' registered by both '${existing.source}' and '${source}'`
      );
    }
    this.store.jobs.set(name, { handler, source });
  }

  defineLiveQueryHandler(source: string, handler: LiveQueryHandler): void {
    this.store.liveQueryHandlers.push({ handler, source });
  }

  // --- Removal (for HooksController REST API and facade compatibility) ---

  removeFunction(name: string): void {
    this.store.functions.delete(name);
  }

  removeTrigger(triggerType: string, className: string): void {
    this.store.triggers.delete(triggerKey(className, triggerType));
  }

  unregisterAll(source: string): void {
    for (const [key, entry] of this.store.functions) {
      if (entry.source === source) this.store.functions.delete(key);
    }
    for (const [key, entry] of this.store.triggers) {
      if (entry.source === source) this.store.triggers.delete(key);
    }
    for (const [key, entry] of this.store.jobs) {
      if (entry.source === source) this.store.jobs.delete(key);
    }
    this.store.liveQueryHandlers = this.store.liveQueryHandlers.filter(e => e.source !== source);
  }

  // --- Lookup ---

  getFunction(name: string): CloudFunctionHandler | undefined {
    return this.store.functions.get(name)?.handler;
  }

  getTrigger(className: string, triggerType: string): CloudTriggerHandler | undefined {
    return this.store.triggers.get(triggerKey(className, triggerType))?.handler;
  }

  triggerExists(className: string, triggerType: string): boolean {
    return this.store.triggers.has(triggerKey(className, triggerType));
  }

  getJob(name: string): CloudJobHandler | undefined {
    return this.store.jobs.get(name)?.handler;
  }

  getJobs(): Map<string, CloudJobHandler> {
    const result = new Map<string, CloudJobHandler>();
    for (const [name, entry] of this.store.jobs) {
      result.set(name, entry.handler);
    }
    return result;
  }

  /** Returns jobs as a plain object (for triggers.js facade backwards compatibility) */
  getJobsObject(): Record<string, CloudJobHandler> {
    const result: Record<string, CloudJobHandler> = {};
    for (const [name, entry] of this.store.jobs) {
      result[name] = entry.handler;
    }
    return result;
  }

  getFunctionNames(): string[] {
    return Array.from(this.store.functions.keys());
  }

  getValidator(key: string): ValidatorHandler | undefined {
    const fn = this.store.functions.get(key);
    if (fn) return fn.validator;
    const trigger = this.store.triggers.get(key);
    if (trigger) return trigger.validator;
    return undefined;
  }

  /** Synchronously clear the entire store. Used by test cleanup (_unregisterAll). */
  clearAll(): void {
    this.store.functions.clear();
    this.store.triggers.clear();
    this.store.jobs.clear();
    this.store.liveQueryHandlers.length = 0;
  }

  // --- Execution ---

  runLiveQueryEventHandlers(data: any): void {
    for (const entry of this.store.liveQueryHandlers) {
      entry.handler(data);
    }
  }
}
```

- [ ] **Step 4: Build and run tests**

Run: `npm run build && TESTING=1 npx jasmine spec/CloudCodeManager.spec.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add -f src/cloud-code/CloudCodeManager.ts src/cloud-code/types.ts spec/CloudCodeManager.spec.js
git commit -m "feat: add CloudCodeManager with registration, conflict detection, and lookup"
```

---

## Chunk 2: LegacyAdapter and Triggers Facade

### Task 3: Implement LegacyAdapter

The LegacyAdapter is intentionally simple — it just loads the cloud code file. All the registration magic happens through the existing `Parse.Cloud.js` → `triggers.js` → `CloudCodeManager` delegation chain (set up in Task 4).

**Files:**
- Create: `src/cloud-code/adapters/LegacyAdapter.ts`

- [ ] **Step 1: Implement LegacyAdapter**

```typescript
// src/cloud-code/adapters/LegacyAdapter.ts
import type { CloudCodeAdapter, CloudCodeRegistry, ParseServerConfig } from '../types';

export class LegacyAdapter implements CloudCodeAdapter {
  readonly name = 'legacy';
  private cloud: string | ((parse: any) => void);

  constructor(cloud: string | ((parse: any) => void)) {
    this.cloud = cloud;
  }

  async initialize(registry: CloudCodeRegistry, _config: ParseServerConfig): Promise<void> {
    // The registry is not used directly by LegacyAdapter.
    // Instead, the cloud code file calls Parse.Cloud.define() etc.,
    // which calls triggers.addFunction() etc.,
    // which the facade delegates to CloudCodeManager.
    //
    // The LegacyAdapter's sole job is to load the cloud code file.
    const Parse = require('parse/node').Parse;

    if (typeof this.cloud === 'function') {
      await Promise.resolve(this.cloud(Parse));
    } else if (typeof this.cloud === 'string') {
      const path = require('path');
      const resolved = path.resolve(process.cwd(), this.cloud);
      // Support both CommonJS and ES modules
      try {
        const pkg = require(path.resolve(process.cwd(), 'package.json'));
        if (process.env.npm_package_type === 'module' || pkg?.type === 'module') {
          await import(resolved);
        } else {
          require(resolved);
        }
      } catch {
        require(resolved);
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async shutdown(): Promise<void> {
    // No-op for in-process code
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -f src/cloud-code/adapters/LegacyAdapter.ts
git commit -m "feat: add LegacyAdapter for loading cloud code files"
```

### Task 4: Create triggers.js Facade

This is the critical migration step. `triggers.js` keeps all its exports, but its internal `add*`, `get*`, and `remove*` functions delegate to `CloudCodeManager` when one is present on `AppCache`.

**Files:**
- Modify: `src/triggers.js`

- [ ] **Step 1: Read the full triggers.js to understand the current structure**

Read: `src/triggers.js` completely. Pay attention to:
- The `_triggerStore` global (line 90)
- The `add()`, `get()`, `remove()` internal functions (lines 123-147)
- All exported functions that call these internals
- The `_unregisterAll()` function (line 183)

- [ ] **Step 2: Add AppCache import and manager helper at top of triggers.js**

Add after existing imports (around line 3):

```javascript
import AppCache from './cache';

function getManager(applicationId) {
  const cached = AppCache.get(applicationId || Parse.applicationId);
  return cached && cached.cloudCodeManager;
}
```

- [ ] **Step 3: Update registration functions to delegate writes**

Update `addFunction`, `addJob`, `addTrigger`, `addConnectTrigger`, `addLiveQueryEventHandler` to delegate to manager when present. **CRITICAL:** The fallback paths must use the original `add(category, name, handler, applicationId)` signature exactly as they are today.

```javascript
export function addFunction(functionName, handler, validationHandler, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    manager.defineFunction('legacy', functionName, handler, validationHandler);
    return;
  }
  // Original code — do not change these signatures
  add(Category.Functions, functionName, handler, applicationId);
  add(Category.Validators, functionName, validationHandler, applicationId);
}

export function addJob(jobName, handler, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    manager.defineJob('legacy', jobName, handler);
    return;
  }
  add(Category.Jobs, jobName, handler, applicationId);
}

export function addTrigger(type, className, handler, applicationId, validationHandler) {
  const manager = getManager(applicationId);
  if (manager) {
    manager.defineTrigger('legacy', className, type, handler, validationHandler);
    return;
  }
  // Original code — preserve exact signatures
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
  add(Category.Validators, `${type}.${className}`, validationHandler, applicationId);
}

export function addConnectTrigger(type, handler, applicationId, validationHandler) {
  const manager = getManager(applicationId);
  if (manager) {
    manager.defineTrigger('legacy', ConnectClassName, type, handler, validationHandler);
    return;
  }
  add(Category.Triggers, `${type}.${ConnectClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${ConnectClassName}`, validationHandler, applicationId);
}

export function addLiveQueryEventHandler(handler, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    manager.defineLiveQueryHandler('legacy', handler);
    return;
  }
  // Original code
  applicationId = applicationId || Parse.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].LiveQuery.push(handler);
}
```

- [ ] **Step 4: Update lookup functions to delegate reads**

**CRITICAL:** Fallback paths must use the original `get(category, name, applicationId)` signature exactly.

```javascript
export function getTrigger(className, triggerType, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    return manager.getTrigger(className, triggerType);
  }
  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}

export function triggerExists(className, type, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    return manager.triggerExists(className, type);
  }
  return !!get(Category.Triggers, `${type}.${className}`, applicationId);
}

export function getFunction(functionName, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    return manager.getFunction(functionName);
  }
  return get(Category.Functions, functionName, applicationId);
}

export function getFunctionNames(applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    return manager.getFunctionNames();
  }
  // ... keep existing implementation as fallback (recursive namespace traversal)
}

export function getJob(jobName, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    return manager.getJob(jobName);
  }
  return get(Category.Jobs, jobName, applicationId);
}

export function getJobs(applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    // Returns plain object for backwards compatibility (consumers use Object.keys())
    return manager.getJobsObject();
  }
  // ... keep existing implementation as fallback
}

export function getValidator(functionName, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    return manager.getValidator(functionName);
  }
  return get(Category.Validators, functionName, applicationId);
}
```

- [ ] **Step 5: Update removal functions**

```javascript
export function removeFunction(functionName, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    manager.removeFunction(functionName);
    return;
  }
  remove(Category.Functions, functionName, applicationId);
}

export function removeTrigger(type, className, applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    manager.removeTrigger(type, className);
    return;
  }
  remove(Category.Triggers, `${type}.${className}`, applicationId);
}
```

- [ ] **Step 6: Update `_unregisterAll` to clear ALL sources in the manager**

The existing `_unregisterAll()` wipes everything for all appIds. When a manager exists, we must clear ALL sources (not just 'legacy') to match this behavior — this is used by test cleanup.

```javascript
export function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => {
    const manager = getManager(appId);
    if (manager) {
      // clearAll() synchronously wipes the entire store (all sources)
      // This matches existing behavior of wiping everything for test cleanup
      manager.clearAll();
    }
    delete _triggerStore[appId];
  });
}
```

- [ ] **Step 7: Update `runLiveQueryEventHandlers` to delegate**

```javascript
export function runLiveQueryEventHandlers(data, applicationId = Parse.applicationId) {
  const manager = getManager(applicationId);
  if (manager) {
    manager.runLiveQueryEventHandlers(data);
    return;
  }
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}
```

- [ ] **Step 8: Build and run existing CloudCode tests**

Run: `npm run build && TESTING=1 npx jasmine --filter="CloudCode"`
Expected: All existing tests PASS (facade falls back to legacy store when no manager present)

- [ ] **Step 9: Commit**

```bash
git add src/triggers.js
git commit -m "feat: add CloudCodeManager delegation layer to triggers.js facade"
```

---

## Chunk 3: ParseServer Integration

### Task 5: Add Config Options

**Files:**
- Modify: `src/Options/index.js`
- Modify: `src/Options/Definitions.js`

- [ ] **Step 1: Add types to `src/Options/index.js`**

After the existing `cloud: ?string` line, add:

```javascript
cloudCodeCommand: ?string,
webhookKey: ?string,
cloudCodeOptions: ?{
  startupTimeout: ?number,
  healthCheckInterval: ?number,
  shutdownTimeout: ?number,
  maxRestartDelay: ?number,
},
cloudCodeAdapters: ?Array<Object>,
```

- [ ] **Step 2: Add definitions to `src/Options/Definitions.js`**

Add in alphabetical order:

```javascript
cloudCodeAdapters: {
  help: 'Array of CloudCodeAdapter instances for BYO cloud code integration',
},
cloudCodeCommand: {
  env: 'PARSE_SERVER_CLOUD_CODE_COMMAND',
  help: 'Shell command to spawn an external cloud code process (ParseCloud/1.0 protocol)',
},
cloudCodeOptions: {
  help: 'Options for the external cloud code process adapter',
},
webhookKey: {
  env: 'PARSE_SERVER_WEBHOOK_KEY',
  help: 'Webhook key for authenticating external cloud code process requests. Required when cloudCodeCommand is set.',
},
```

- [ ] **Step 3: Commit**

```bash
git add src/Options/index.js src/Options/Definitions.js
git commit -m "feat: add config options for cloud code adapters"
```

### Task 6: Integrate CloudCodeManager into ParseServer Startup

**Files:**
- Modify: `src/ParseServer.ts`

- [ ] **Step 1: Read the current ParseServer.ts startup flow**

Read: `src/ParseServer.ts` — focus on the `start()` method (lines ~150-210) and the cloud code loading block (lines ~187-202).

- [ ] **Step 2: Add imports at top of ParseServer.ts**

```typescript
import { CloudCodeManager } from './cloud-code/CloudCodeManager';
import { LegacyAdapter } from './cloud-code/adapters/LegacyAdapter';
import { InProcessAdapter } from './cloud-code/adapters/InProcessAdapter';
import { ExternalProcessAdapter } from './cloud-code/adapters/ExternalProcessAdapter';
```

- [ ] **Step 3: Add resolveAdapters function**

Add before the `ParseServer` class or as a module-level function:

```typescript
function resolveAdapters(options: any): any[] {
  const adapters: any[] = [];

  if (options.cloudCodeAdapters) {
    adapters.push(...options.cloudCodeAdapters);
  }

  if (options.cloud) {
    if (typeof options.cloud === 'object' && typeof options.cloud.getRouter === 'function') {
      adapters.push(new InProcessAdapter(options.cloud));
    } else {
      adapters.push(new LegacyAdapter(options.cloud));
    }
  }

  if (options.cloudCodeCommand) {
    if (!options.webhookKey) {
      throw new Error('webhookKey is required when using cloudCodeCommand');
    }
    adapters.push(new ExternalProcessAdapter(
      options.cloudCodeCommand,
      options.webhookKey,
      options.cloudCodeOptions
    ));
  }

  return adapters;
}
```

- [ ] **Step 4: Replace cloud code loading block in start() method**

Replace the existing cloud code loading block (lines ~187-202) with:

```typescript
const adapters = resolveAdapters({
  cloud,
  cloudCodeCommand: this.config.cloudCodeCommand,
  webhookKey: this.config.webhookKey,
  cloudCodeOptions: this.config.cloudCodeOptions,
  cloudCodeAdapters: this.config.cloudCodeAdapters,
});

if (adapters.length > 0) {
  addParseCloud();
  const cloudManager = new CloudCodeManager();

  // CRITICAL: Store on this.config BEFORE adapter initialization.
  // this.config flows into AppCache via Config.put() later in start().
  // We must also store it on AppCache NOW so the facade can find it
  // during LegacyAdapter.initialize() → Parse.Cloud.define() → triggers.addFunction().
  this.config.cloudCodeManager = cloudManager;
  const appId = this.config.appId;
  const cached = AppCache.get(appId);
  if (cached) {
    cached.cloudCodeManager = cloudManager;
  }

  await cloudManager.initialize(adapters, {
    appId,
    masterKey: this.config.masterKey,
    serverURL: this.config.serverURL || `http://localhost:${this.config.port}${this.config.mountPath || '/parse'}`,
  });
}
```

**Critical ordering notes:**
1. `cloudManager` must be on both `this.config` AND `AppCache` BEFORE `initialize()` — because LegacyAdapter loads cloud code synchronously during `initialize()`, and those `Parse.Cloud.define()` calls flow through the facade which reads from `AppCache`.
2. Storing on `this.config` ensures the reference survives the `Config.put(this.config)` call at the end of `start()`, which overwrites the AppCache entry with `this.config`.

- [ ] **Step 5: Add AppCache import if not already present**

Verify `AppCache` is imported. It may already be imported in ParseServer.ts as `import cache from './cache'` — if so, use `cache` instead of `AppCache`.

- [ ] **Step 6: Build and run tests**

Run: `npm run build && TESTING=1 npx jasmine --filter="CloudCode"`
Expected: All existing tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/ParseServer.ts
git commit -m "feat: integrate CloudCodeManager initialization into ParseServer startup"
```

---

## Chunk 4: InProcessAdapter and Webhook Bridge

### Task 7: Implement Webhook Bridge

**Files:**
- Create: `src/cloud-code/adapters/webhook-bridge.ts`

- [ ] **Step 1: Create the webhook bridge**

```typescript
// src/cloud-code/adapters/webhook-bridge.ts
import { Parse } from 'parse/node';
import type { WebhookResponse } from '../types';

export function requestToWebhookBody(request: any): Record<string, unknown> {
  const body: Record<string, unknown> = {
    master: request.master ?? false,
    ip: request.ip ?? '',
    headers: request.headers ?? {},
    installationId: request.installationId,
  };

  if (request.user) {
    body.user = typeof request.user.toJSON === 'function' ? request.user.toJSON() : request.user;
  }
  if (request.params !== undefined) body.params = request.params;
  if (request.jobId !== undefined) body.jobId = request.jobId;
  if (request.object) {
    body.object = typeof request.object.toJSON === 'function' ? request.object.toJSON() : request.object;
  }
  if (request.original) {
    body.original = typeof request.original.toJSON === 'function' ? request.original.toJSON() : request.original;
  }
  if (request.context !== undefined) body.context = request.context;
  if (request.query) {
    body.query = {
      className: request.query.className,
      where: request.query._where,
      limit: request.query._limit,
      skip: request.query._skip,
      include: request.query._include?.join(','),
      keys: request.query._keys?.join(','),
      order: request.query._order,
    };
  }
  if (request.count !== undefined) body.count = request.count;
  if (request.isGet !== undefined) body.isGet = request.isGet;
  if (request.file) body.file = request.file;
  if (request.fileSize !== undefined) body.fileSize = request.fileSize;
  if (request.event) body.event = request.event;
  if (request.requestId !== undefined) body.requestId = request.requestId;
  if (request.clients !== undefined) body.clients = request.clients;
  if (request.subscriptions !== undefined) body.subscriptions = request.subscriptions;

  return body;
}

export function webhookResponseToResult(response: WebhookResponse): unknown {
  if ('error' in response) {
    throw new Parse.Error(response.error.code, response.error.message);
  }
  return response.success;
}

export function applyBeforeSaveResponse(request: any, response: WebhookResponse): void {
  if ('error' in response) {
    throw new Parse.Error(response.error.code, response.error.message);
  }
  const result = response.success;
  if (typeof result === 'object' && result !== null && Object.keys(result).length === 0) {
    return;
  }
  if (typeof result === 'object' && result !== null) {
    const skipFields = ['objectId', 'createdAt', 'updatedAt', 'className'];
    for (const [key, value] of Object.entries(result)) {
      if (!skipFields.includes(key)) {
        request.object.set(key, value);
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -f src/cloud-code/adapters/webhook-bridge.ts
git commit -m "feat: add webhook bridge for request/response conversion"
```

### Task 8: Implement InProcessAdapter

**Files:**
- Create: `src/cloud-code/adapters/InProcessAdapter.ts`
- Test: `spec/InProcessAdapter.spec.js`

- [ ] **Step 1: Write failing tests**

```javascript
// spec/InProcessAdapter.spec.js
const { InProcessAdapter } = require('../lib/cloud-code/adapters/InProcessAdapter');
const { CloudCodeManager } = require('../lib/cloud-code/CloudCodeManager');

function createMockCloudCode(manifest, handlers = {}) {
  return {
    getRouter() {
      return {
        getManifest() { return manifest; },
        async dispatchFunction(name, body) {
          if (handlers[`function:${name}`]) return handlers[`function:${name}`](body);
          return { success: null };
        },
        async dispatchTrigger(className, triggerName, body) {
          if (handlers[`trigger:${triggerName}.${className}`]) return handlers[`trigger:${triggerName}.${className}`](body);
          return { success: {} };
        },
        async dispatchJob(name, body) {
          if (handlers[`job:${name}`]) return handlers[`job:${name}`](body);
          return { success: null };
        },
      };
    },
  };
}

describe('InProcessAdapter', () => {
  let manager;

  beforeEach(() => {
    manager = new CloudCodeManager();
  });

  it('has name "in-process"', () => {
    const cloud = createMockCloudCode({ protocol: 'ParseCloud/1.0', hooks: { functions: [], triggers: [], jobs: [] } });
    const adapter = new InProcessAdapter(cloud);
    expect(adapter.name).toBe('in-process');
  });

  it('registers functions from manifest', async () => {
    const cloud = createMockCloudCode({
      protocol: 'ParseCloud/1.0',
      hooks: {
        functions: [{ name: 'hello' }, { name: 'greet' }],
        triggers: [],
        jobs: [],
      },
    });
    const adapter = new InProcessAdapter(cloud);
    const registry = manager.createRegistry(adapter.name);
    await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

    expect(manager.getFunction('hello')).toBeDefined();
    expect(manager.getFunction('greet')).toBeDefined();
  });

  it('registers triggers from manifest', async () => {
    const cloud = createMockCloudCode({
      protocol: 'ParseCloud/1.0',
      hooks: {
        functions: [],
        triggers: [{ className: 'Todo', triggerName: 'beforeSave' }],
        jobs: [],
      },
    });
    const adapter = new InProcessAdapter(cloud);
    const registry = manager.createRegistry(adapter.name);
    await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

    expect(manager.getTrigger('Todo', 'beforeSave')).toBeDefined();
  });

  it('registers jobs from manifest', async () => {
    const cloud = createMockCloudCode({
      protocol: 'ParseCloud/1.0',
      hooks: {
        functions: [],
        triggers: [],
        jobs: [{ name: 'cleanup' }],
      },
    });
    const adapter = new InProcessAdapter(cloud);
    const registry = manager.createRegistry(adapter.name);
    await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

    expect(manager.getJob('cleanup')).toBeDefined();
  });

  it('bridge handler dispatches function and returns result', async () => {
    const cloud = createMockCloudCode(
      { protocol: 'ParseCloud/1.0', hooks: { functions: [{ name: 'add' }], triggers: [], jobs: [] } },
      { 'function:add': (body) => ({ success: body.params.a + body.params.b }) }
    );
    const adapter = new InProcessAdapter(cloud);
    const registry = manager.createRegistry(adapter.name);
    await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

    const handler = manager.getFunction('add');
    const result = await handler({ params: { a: 2, b: 3 }, master: false, ip: '127.0.0.1', headers: {} });
    expect(result).toBe(5);
  });

  it('bridge handler throws Parse.Error on error response', async () => {
    const cloud = createMockCloudCode(
      { protocol: 'ParseCloud/1.0', hooks: { functions: [{ name: 'fail' }], triggers: [], jobs: [] } },
      { 'function:fail': () => ({ error: { code: 141, message: 'boom' } }) }
    );
    const adapter = new InProcessAdapter(cloud);
    const registry = manager.createRegistry(adapter.name);
    await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

    const handler = manager.getFunction('fail');
    await expectAsync(handler({ params: {}, master: false, ip: '', headers: {} }))
      .toBeRejectedWithError(/boom/);
  });

  it('isHealthy returns true', async () => {
    const cloud = createMockCloudCode({ protocol: 'ParseCloud/1.0', hooks: { functions: [], triggers: [], jobs: [] } });
    const adapter = new InProcessAdapter(cloud);
    expect(await adapter.isHealthy()).toBe(true);
  });
});
```

- [ ] **Step 2: Implement InProcessAdapter**

```typescript
// src/cloud-code/adapters/InProcessAdapter.ts
import type {
  CloudCodeAdapter,
  CloudCodeRegistry,
  ParseServerConfig,
  InProcessCloudCode,
} from '../types';
import { requestToWebhookBody, webhookResponseToResult, applyBeforeSaveResponse } from './webhook-bridge';

export class InProcessAdapter implements CloudCodeAdapter {
  readonly name = 'in-process';
  private cloudCode: InProcessCloudCode;

  constructor(cloudCode: InProcessCloudCode) {
    this.cloudCode = cloudCode;
  }

  async initialize(registry: CloudCodeRegistry, _config: ParseServerConfig): Promise<void> {
    const router = this.cloudCode.getRouter();
    const manifest = router.getManifest();

    for (const fn of manifest.hooks.functions) {
      registry.defineFunction(fn.name, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await router.dispatchFunction(fn.name, body);
        return webhookResponseToResult(response);
      });
    }

    for (const trigger of manifest.hooks.triggers) {
      const { className, triggerName } = trigger;
      registry.defineTrigger(className, triggerName as any, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await router.dispatchTrigger(className, triggerName, body);
        if (triggerName === 'beforeSave') {
          applyBeforeSaveResponse(request, response);
          return;
        }
        return webhookResponseToResult(response);
      });
    }

    for (const job of manifest.hooks.jobs) {
      registry.defineJob(job.name, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await router.dispatchJob(job.name, body);
        return webhookResponseToResult(response);
      });
    }
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async shutdown(): Promise<void> {}
}
```

- [ ] **Step 3: Build and run tests**

Run: `npm run build && TESTING=1 npx jasmine spec/InProcessAdapter.spec.js`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add -f src/cloud-code/adapters/InProcessAdapter.ts spec/InProcessAdapter.spec.js
git commit -m "feat: add InProcessAdapter with webhook bridge for manifest-based cloud code"
```

---

## Chunk 5: ExternalProcessAdapter

### Task 9: Implement ExternalProcessAdapter

**Files:**
- Create: `src/cloud-code/adapters/ExternalProcessAdapter.ts`
- Test: `spec/ExternalProcessAdapter.spec.js`

- [ ] **Step 1: Write failing tests**

```javascript
// spec/ExternalProcessAdapter.spec.js
const { ExternalProcessAdapter } = require('../lib/cloud-code/adapters/ExternalProcessAdapter');
const { CloudCodeManager } = require('../lib/cloud-code/CloudCodeManager');
const http = require('http');

function createMockCloudServer(manifest, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(manifest));
      } else if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200);
        res.end('OK');
      } else if (req.url.startsWith('/functions/') && req.method === 'POST') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: 'external-result' }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(port, () => resolve(server));
  });
}

describe('ExternalProcessAdapter', () => {
  it('has name "external-process"', () => {
    const adapter = new ExternalProcessAdapter('echo test', 'secret-key');
    expect(adapter.name).toBe('external-process');
  });

  it('requires webhookKey', () => {
    expect(() => new ExternalProcessAdapter('echo test', '')).toThrowError(/webhookKey/);
  });

  it('shutdown resolves cleanly when no process started', async () => {
    const adapter = new ExternalProcessAdapter('echo test', 'key');
    await expectAsync(adapter.shutdown()).toBeResolved();
  });

  it('spawns process and reads manifest', async () => {
    const manager = new CloudCodeManager();
    const port = 19876;
    const server = await createMockCloudServer(
      { protocol: 'ParseCloud/1.0', hooks: { functions: [{ name: 'ext-fn' }], triggers: [], jobs: [] } },
      port
    );

    try {
      const cmd = `node -e "process.stdout.write('PARSE_CLOUD_READY:${port}\\n'); setTimeout(() => {}, 60000)"`;
      const adapter = new ExternalProcessAdapter(cmd, 'test-key', {
        startupTimeout: 5000,
        healthCheckInterval: 0,
      });
      const registry = manager.createRegistry(adapter.name);
      await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

      expect(manager.getFunction('ext-fn')).toBeDefined();

      await adapter.shutdown();
    } finally {
      server.close();
    }
  }, 10000);
});
```

- [ ] **Step 2: Implement ExternalProcessAdapter**

```typescript
// src/cloud-code/adapters/ExternalProcessAdapter.ts
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import type {
  CloudCodeAdapter,
  CloudCodeRegistry,
  ParseServerConfig,
  CloudManifest,
  CloudCodeOptions,
  WebhookResponse,
} from '../types';
import { requestToWebhookBody, webhookResponseToResult, applyBeforeSaveResponse } from './webhook-bridge';

const DEFAULT_OPTIONS: Required<CloudCodeOptions> = {
  startupTimeout: 30000,
  healthCheckInterval: 30000,
  shutdownTimeout: 5000,
  maxRestartDelay: 30000,
};

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function httpPost(url: string, body: Record<string, unknown>, webhookKey: string): Promise<WebhookResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Parse-Webhook-Key': webhookKey,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from cloud code process: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export class ExternalProcessAdapter implements CloudCodeAdapter {
  readonly name = 'external-process';
  private command: string;
  private webhookKey: string;
  private options: Required<CloudCodeOptions>;
  private process: ChildProcess | null = null;
  private port: number = 0;
  private healthInterval: ReturnType<typeof setInterval> | null = null;

  constructor(command: string, webhookKey: string, options?: CloudCodeOptions) {
    if (!webhookKey) {
      throw new Error('webhookKey is required for ExternalProcessAdapter');
    }
    this.command = command;
    this.webhookKey = webhookKey;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async initialize(registry: CloudCodeRegistry, config: ParseServerConfig): Promise<void> {
    this.port = await this.spawnAndWaitForReady(config);
    const manifest = await this.fetchManifest();
    this.registerFromManifest(registry, manifest);

    if (this.options.healthCheckInterval > 0) {
      this.healthInterval = setInterval(() => this.checkHealth(), this.options.healthCheckInterval);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await httpGet(`http://localhost:${this.port}/health`);
      return response === 'OK' || response.includes('ok');
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolve) => this.process!.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, this.options.shutdownTimeout)),
      ]);
    }
    this.process = null;
  }

  private spawnAndWaitForReady(config: ParseServerConfig): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, {
        shell: true,
        env: {
          ...process.env,
          PARSE_SERVER_URL: config.serverURL,
          PARSE_APPLICATION_ID: config.appId,
          PARSE_MASTER_KEY: config.masterKey,
          PARSE_WEBHOOK_KEY: this.webhookKey,
          PARSE_CLOUD_PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process = child;

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Cloud code process did not emit PARSE_CLOUD_READY within ${this.options.startupTimeout}ms`));
      }, this.options.startupTimeout);

      let stdout = '';
      child.stdout!.on('data', (data) => {
        stdout += data.toString();
        const match = stdout.match(/PARSE_CLOUD_READY:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(parseInt(match[1], 10));
        }
      });

      child.stderr!.on('data', (data) => {
        process.stderr.write(`[cloud-code] ${data}`);
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn cloud code process: ${err.message}`));
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (!this.port) {
          reject(new Error(`Cloud code process exited with code ${code} before becoming ready`));
        }
      });
    });
  }

  private async fetchManifest(): Promise<CloudManifest> {
    const data = await httpGet(`http://localhost:${this.port}/`);
    return JSON.parse(data);
  }

  private registerFromManifest(registry: CloudCodeRegistry, manifest: CloudManifest): void {
    for (const fn of manifest.hooks.functions) {
      registry.defineFunction(fn.name, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await httpPost(`http://localhost:${this.port}/functions/${fn.name}`, body, this.webhookKey);
        return webhookResponseToResult(response);
      });
    }

    for (const trigger of manifest.hooks.triggers) {
      const { className, triggerName } = trigger;
      registry.defineTrigger(className, triggerName as any, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await httpPost(
          `http://localhost:${this.port}/triggers/${className}/${triggerName}`,
          body,
          this.webhookKey
        );
        if (triggerName === 'beforeSave') {
          applyBeforeSaveResponse(request, response);
          return;
        }
        return webhookResponseToResult(response);
      });
    }

    for (const job of manifest.hooks.jobs) {
      registry.defineJob(job.name, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await httpPost(`http://localhost:${this.port}/jobs/${job.name}`, body, this.webhookKey);
        return webhookResponseToResult(response);
      });
    }
  }

  private async checkHealth(): Promise<void> {
    const healthy = await this.isHealthy();
    if (!healthy) {
      console.warn('[cloud-code] External process health check failed');
    }
  }
}
```

- [ ] **Step 3: Build and run tests**

Run: `npm run build && TESTING=1 npx jasmine spec/ExternalProcessAdapter.spec.js`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add -f src/cloud-code/adapters/ExternalProcessAdapter.ts spec/ExternalProcessAdapter.spec.js
git commit -m "feat: add ExternalProcessAdapter with child process lifecycle management"
```

---

## Chunk 6: Integration Tests and Full Verification

### Task 10: Integration Tests

**Files:**
- Create: `spec/CloudCodeAdapter.integration.spec.js`

- [ ] **Step 1: Write integration tests**

```javascript
// spec/CloudCodeAdapter.integration.spec.js
const { CloudCodeManager } = require('../lib/cloud-code/CloudCodeManager');
const { LegacyAdapter } = require('../lib/cloud-code/adapters/LegacyAdapter');
const { InProcessAdapter } = require('../lib/cloud-code/adapters/InProcessAdapter');

describe('Cloud Code Adapter Integration', () => {
  describe('composable adapters', () => {
    it('supports LegacyAdapter + InProcessAdapter registering different hooks', async () => {
      const manager = new CloudCodeManager();

      const legacyCloud = (Parse) => {
        Parse.Cloud.define('legacyFn', () => 'from-legacy');
      };

      const inProcessCloud = {
        getRouter() {
          return {
            getManifest() {
              return {
                protocol: 'ParseCloud/1.0',
                hooks: {
                  functions: [{ name: 'inProcessFn' }],
                  triggers: [],
                  jobs: [],
                },
              };
            },
            async dispatchFunction() { return { success: 'from-in-process' }; },
            async dispatchTrigger() { return { success: {} }; },
            async dispatchJob() { return { success: null }; },
          };
        },
      };

      // InProcessAdapter first (registers directly), then LegacyAdapter
      // Note: LegacyAdapter needs the manager on AppCache for the facade to work.
      // In real usage, ParseServer.start() handles this. For testing, we use
      // the InProcess adapter (which registers directly) to verify composition.
      const inProcessAdapter = new InProcessAdapter(inProcessCloud);
      const inProcessRegistry = manager.createRegistry(inProcessAdapter.name);
      await inProcessAdapter.initialize(inProcessRegistry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

      // Simulate legacy registration via manager directly
      manager.defineFunction('legacy', 'legacyFn', () => 'from-legacy');

      expect(manager.getFunction('legacyFn')).toBeDefined();
      expect(manager.getFunction('inProcessFn')).toBeDefined();
      expect(manager.getFunctionNames().sort()).toEqual(['inProcessFn', 'legacyFn']);
    });

    it('throws on conflict between adapters', async () => {
      const manager = new CloudCodeManager();

      // Register a function from "legacy" source
      manager.defineFunction('legacy', 'shared', () => 'from-legacy');

      // InProcess adapter tries to register same function
      const inProcessCloud = {
        getRouter() {
          return {
            getManifest() {
              return {
                protocol: 'ParseCloud/1.0',
                hooks: { functions: [{ name: 'shared' }], triggers: [], jobs: [] },
              };
            },
            async dispatchFunction() { return { success: 'from-in-process' }; },
            async dispatchTrigger() { return { success: {} }; },
            async dispatchJob() { return { success: null }; },
          };
        },
      };

      const adapter = new InProcessAdapter(inProcessCloud);
      const registry = manager.createRegistry(adapter.name);

      await expectAsync(
        adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' })
      ).toBeRejectedWithError(/Cloud code conflict.*shared.*legacy.*in-process/);
    });
  });

  describe('shutdown', () => {
    it('shuts down all adapters', async () => {
      const manager = new CloudCodeManager();
      let shutdownCalled = false;

      const adapter = {
        name: 'test',
        async initialize() {},
        async isHealthy() { return true; },
        async shutdown() { shutdownCalled = true; },
      };

      await manager.initialize([adapter], { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });
      await manager.shutdown();

      expect(shutdownCalled).toBe(true);
    });
  });

  describe('unregisterAll', () => {
    it('allows re-registration after unregisterAll', () => {
      const manager = new CloudCodeManager();
      manager.defineFunction('adapter-a', 'fn', () => 'first');
      manager.unregisterAll('adapter-a');

      // Now a different adapter can register the same name
      expect(() => {
        manager.defineFunction('adapter-b', 'fn', () => 'second');
      }).not.toThrow();
      expect(manager.getFunction('fn')).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Build and run integration tests**

Run: `npm run build && TESTING=1 npx jasmine spec/CloudCodeAdapter.integration.spec.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add -f spec/CloudCodeAdapter.integration.spec.js
git commit -m "test: add integration tests for composable cloud code adapters"
```

### Task 11: Full Test Suite Verification

- [ ] **Step 1: Build everything**

Run: `npm run build`

- [ ] **Step 2: Run complete test suite**

Run: `npm run testonly`

- [ ] **Step 3: Fix any failures**

If tests fail, analyze each failure:
- **Import issues:** Verify triggers.js facade imports `AppCache` correctly
- **Manager not found:** Verify facade falls back to legacy store when no manager exists (most tests won't have a manager)
- **Type errors:** Verify Babel compiles all `.ts` files correctly
- **Behavioral changes:** Verify facade delegation matches original behavior exactly

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve test regressions from cloud code adapter integration"
```
