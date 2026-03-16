# Cloud Code Adapter — Design Specification

**Status:** Approved
**Target:** Parse Server 10.x
**Date:** 2026-03-16
**Related:** [ParseCloud/1.0 Protocol](../../../parse-lite-sdks/docs/cloud-code-protocol.md), [Adapter Proposal](../../../parse-lite-sdks/docs/cloud-code-adapter-proposal.md)

---

## 1. Problem Statement

Parse Server's cloud code system (`Parse.Cloud.define`, `Parse.Cloud.beforeSave`, etc.) has fundamental limitations:

1. **JavaScript only** — No support for cloud code in Swift, C#, Go, or other languages.
2. **Global singleton** — All cloud code shares `Parse.Cloud` namespace. No composition, difficult testing.
3. **In-process only** — No supported mechanism for cloud code as a separate process or service.
4. **No adapter pattern** — Hard-wired implementation with no pluggable interface.
5. **Manual webhook registration** — External webhooks require manual REST API calls.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Adapter composition | Multiple adapters coexist | Users can run legacy JS + external Swift + custom adapters simultaneously |
| Hook conflicts | Error on conflict at startup | Fail fast, no ambiguity about which adapter handles a hook |
| Hot reload | Startup-only for v1 | Simpler implementation; can be added later |
| Registry API | Adapters only (no public registry) | Clean boundary, single integration point |
| Implementation location | In parse-server directly | Core server functionality |
| Webhook key | Explicitly configured (required) | No auto-generation, no persistence question |
| Language | TypeScript | Type safety throughout |
| Architecture | Replace triggers.js entirely | CloudCodeManager becomes single source of truth |

## 3. Architecture

### 3.1 CloudCodeManager — The New Core

`CloudCodeManager` replaces `triggers.js` as the single source of truth for all hook registration, lookup, and execution.

```typescript
class CloudCodeManager {
  private adapters: Map<string, CloudCodeAdapter>;
  private store: HookStore;

  // Lifecycle
  async initialize(adapterConfigs: AdapterConfig[], serverConfig: ParseServerConfig): Promise<void>;
  async shutdown(): Promise<void>;
  async healthCheck(): Promise<Map<string, boolean>>;

  // Registration (called by adapters via CloudCodeRegistry)
  defineFunction(source: string, name: string, handler: CloudFunctionHandler, validator?: ValidatorHandler): void;
  defineTrigger(source: string, className: string, triggerName: TriggerName, handler: CloudTriggerHandler, validator?: ValidatorHandler): void;
  defineJob(source: string, name: string, handler: CloudJobHandler): void;
  unregisterAll(source: string): void;

  // Lookup (consumed by routers, rest of Parse Server)
  getFunction(name: string, applicationId: string): CloudFunctionHandler | undefined;
  getTrigger(className: string, triggerType: string, applicationId: string): CloudTriggerHandler | undefined;
  getJob(name: string, applicationId: string): CloudJobHandler | undefined;
  getFunctionNames(applicationId: string): string[];
  getValidator(functionName: string, applicationId: string): ValidatorHandler | undefined;

  // Execution (replaces maybeRunTrigger, maybeRunValidator)
  async runTrigger(triggerType: string, auth: Auth, parseObject: ParseObject, ...): Promise<any>;
  async runValidator(request: any, functionName: string, auth: Auth): Promise<void>;
}
```

### 3.2 HookStore

Typed internal structure replacing `Object.create(null)` pattern:

```typescript
interface HookStore {
  functions: Map<string, { handler: CloudFunctionHandler; source: string; validator?: ValidatorHandler }>;
  triggers: Map<string, { handler: CloudTriggerHandler; source: string; validator?: ValidatorHandler }>;
  // key format: `${triggerType}.${className}`
  jobs: Map<string, { handler: CloudJobHandler; source: string }>;
  liveQueryHandlers: Array<{ handler: LiveQueryHandler; source: string }>;
}
```

### 3.3 CloudCodeAdapter Interface

```typescript
interface CloudCodeAdapter {
  /** Unique identifier for this adapter instance */
  readonly name: string;

  /** Register all hooks with the registry. Called once at startup. */
  initialize(registry: CloudCodeRegistry, config: ParseServerConfig): Promise<void>;

  /** Return true if adapter is healthy and ready. */
  isHealthy(): Promise<boolean>;

  /** Clean up resources. Called during Parse Server shutdown. */
  shutdown(): Promise<void>;
}
```

### 3.4 CloudCodeRegistry

Scoped per-adapter. Created by `CloudCodeManager` with the adapter's `name` bound as `source`:

```typescript
interface CloudCodeRegistry {
  defineFunction(name: string, handler: CloudFunctionHandler, validator?: ValidatorHandler): void;
  defineTrigger(className: string, triggerName: TriggerName, handler: CloudTriggerHandler, validator?: ValidatorHandler): void;
  defineJob(name: string, handler: CloudJobHandler): void;
}

type TriggerName =
  | 'beforeSave' | 'afterSave'
  | 'beforeDelete' | 'afterDelete'
  | 'beforeFind' | 'afterFind'
  | 'beforeLogin' | 'afterLogin' | 'afterLogout'
  | 'beforeConnect' | 'beforeSubscribe' | 'afterEvent'
  | 'beforeSaveFile' | 'afterSaveFile'
  | 'beforeDeleteFile' | 'afterDeleteFile';
```

## 4. Built-in Adapter Implementations

### 4.1 LegacyAdapter

Wraps `cloud: './main.js'` or `cloud: (parse) => {}`. Zero breaking changes.

- `initialize()` temporarily patches `Parse.Cloud.*` methods to route through the registry, loads the user's cloud code file, then restores originals.
- `isHealthy()` always returns `true` (in-process).
- `shutdown()` is a no-op.

### 4.2 InProcessAdapter

Wraps `cloud: cloudInstance` where `cloudInstance` has a `getRouter()` method (duck-typed).

- `initialize()` calls `getRouter().getManifest()`, creates bridge handlers for each hook that convert Parse Server requests to webhook body format and call `dispatchFunction`/`dispatchTrigger`/`dispatchJob`.
- `isHealthy()` always returns `true` (in-process).
- `shutdown()` is a no-op.

**Duck-typed interface:**

```typescript
interface InProcessCloudCode {
  getRouter(): {
    getManifest(): CloudManifest;
    dispatchFunction(name: string, body: Record<string, unknown>): Promise<WebhookResponse>;
    dispatchTrigger(className: string, triggerName: string, body: Record<string, unknown>): Promise<WebhookResponse>;
    dispatchJob(name: string, body: Record<string, unknown>): Promise<WebhookResponse>;
  };
}

interface CloudManifest {
  protocol: string;
  hooks: {
    functions: Array<{ name: string }>;
    triggers: Array<{ className: string; triggerName: string }>;
    jobs: Array<{ name: string }>;
  };
}

type WebhookResponse =
  | { success: unknown }
  | { error: { code: number; message: string } };
```

### 4.3 ExternalProcessAdapter

Wraps `cloudCodeCommand: 'swift run CloudCode'`.

- `initialize()` spawns child process with environment variables, waits for `PARSE_CLOUD_READY:<port>` on stdout, fetches manifest via `GET http://localhost:<port>/`, registers bridge handlers.
- `isHealthy()` calls `GET http://localhost:<port>/health`.
- `shutdown()` sends `SIGTERM`, waits `shutdownTimeout`, then `SIGKILL`.
- Crash recovery: unregisters hooks, restarts with exponential backoff (1s, 2s, 4s, 8s, capped at `maxRestartDelay`).

**Environment variables passed to child process:**

| Variable | Source |
|----------|--------|
| `PARSE_SERVER_URL` | Parse Server's own URL |
| `PARSE_APPLICATION_ID` | `appId` from config |
| `PARSE_MASTER_KEY` | `masterKey` from config |
| `PARSE_WEBHOOK_KEY` | `webhookKey` from config (required) |
| `PARSE_CLOUD_PORT` | `0` (OS-assigned) |

## 5. Configuration

### 5.1 ParseServerOptions Extension

```typescript
interface ParseServerOptions {
  // Existing (unchanged, routes through LegacyAdapter):
  cloud?: string | ((parse: any) => void) | InProcessCloudCode;

  // New — external process:
  cloudCodeCommand?: string;
  webhookKey?: string;  // Required when cloudCodeCommand is set
  cloudCodeOptions?: {
    startupTimeout?: number;     // default 30000ms
    healthCheckInterval?: number; // default 30000ms
    shutdownTimeout?: number;     // default 5000ms
    maxRestartDelay?: number;     // default 30000ms
  };

  // New — explicit BYO adapter(s):
  cloudCodeAdapters?: CloudCodeAdapter[];
}
```

### 5.2 Resolution Order

All sources compose. Any hook collision throws at startup.

```typescript
function resolveAdapters(options: ParseServerOptions): CloudCodeAdapter[] {
  const adapters: CloudCodeAdapter[] = [];

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

### 5.3 Startup Sequence

1. `ParseServer` constructor
2. `resolveAdapters(options)` → `CloudCodeAdapter[]`
3. `CloudCodeManager.initialize(adapters, config)`
   - For each adapter: create scoped `CloudCodeRegistry`, call `adapter.initialize(registry, config)`
   - Registry calls flow into `HookStore` with conflict checks
4. If any conflict → throw, server does not start
5. All routers use `CloudCodeManager` for lookups

### 5.4 Conflict Error Format

```
"Cloud code conflict: beforeSave on 'Todo' registered by both 'legacy' and 'external-process'"
```

## 6. Migration Strategy — Replacing triggers.js

### 6.1 Current Consumers

| Consumer | triggers.js Usage | Migration |
|----------|-------------------|-----------|
| `Parse.Cloud.js` | `addFunction`, `addTrigger`, `addJob`, `addConnectTrigger`, `addLiveQueryEventHandler` | LegacyAdapter delegates to `CloudCodeRegistry` |
| `FunctionsRouter.js` | `getFunction`, `getJob`, `getFunctionNames`, `maybeRunValidator` | Import from `CloudCodeManager` |
| `CloudCodeRouter.js` | `getJob` (scheduled jobs) | Import from `CloudCodeManager` |
| `RestWrite.js` | `getTrigger`, `maybeRunTrigger`, `getRequestObject` | Import from `CloudCodeManager` |
| `RestQuery.js` | `getTrigger`, `maybeRunTrigger` | Import from `CloudCodeManager` |
| `UsersRouter.js` | `getTrigger` (login/logout) | Import from `CloudCodeManager` |
| `FilesRouter.js` | `getTrigger` (file triggers) | Import from `CloudCodeManager` |
| `LiveQuery/` | `getTrigger`, `maybeRunTrigger`, connect/subscribe | Import from `CloudCodeManager` |
| `Config.js` | Validates cloud config | Updated for new options |

### 6.2 Migration Approach

1. **`triggers.ts` becomes a thin re-export facade** — all exports delegate to `CloudCodeManager` on the current app's `Config`. Existing import sites work without immediate changes.
2. **Incremental consumer migration** — update consumers one file at a time from `triggers.*` to `config.cloud.*` (the `CloudCodeManager` instance on `Config`).
3. **Facade removal** — once all consumers are migrated, delete `triggers.ts`.

### 6.3 Parse.Cloud.js Transformation

`LegacyAdapter` temporarily patches `Parse.Cloud.*` during `initialize()`:

```typescript
class LegacyAdapter implements CloudCodeAdapter {
  readonly name = 'legacy';

  async initialize(registry: CloudCodeRegistry, config: ParseServerConfig): Promise<void> {
    const originalDefine = Parse.Cloud.define;
    Parse.Cloud.define = (name, handler, validator) => {
      registry.defineFunction(name, handler, validator);
    };
    // ... same for beforeSave, afterSave, etc.

    if (typeof this.cloud === 'string') {
      require(this.cloud);
    } else if (typeof this.cloud === 'function') {
      this.cloud(Parse);
    }

    Parse.Cloud.define = originalDefine;
    // ...
  }
}
```

### 6.4 Utility Functions

Pure data transformation helpers from `triggers.js` (`getRequestObject()`, `getResponseObject()`, `resolveError()`, `toJSONwithObjects()`) move to `src/cloud-code/request-utils.ts`. They have no dependency on the hook store.

## 7. Request/Response Bridge

For `InProcessAdapter` and `ExternalProcessAdapter`, a bridge converts between Parse Server's internal request objects and the webhook body format.

### Parse Request → Webhook Body

Converts `Parse.Object` instances to JSON, maps all trigger-specific fields (object, original, query, file, context, etc.).

### Webhook Response → Parse Result

- `{ success: <value> }` → return value
- `{ error: { code, message } }` → throw `Parse.Error`

### beforeSave Special Case

- Empty object `{}` → accept original (no changes)
- Object with fields → apply field changes to `request.object`
- Error → reject save

## 8. Non-Goals (v1)

- **Hot reload** — hooks registered once at startup
- **Public CloudCodeRegistry API** — all registration through adapters
- **Multi-process orchestration** — one external process per adapter
- **Auto-generated webhook key** — must be explicitly configured
