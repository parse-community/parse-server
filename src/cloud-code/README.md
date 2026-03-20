# Cloud Code SDK Adapter

Parse Server lets any JS SDK register cloud code hooks without depending on `parse/node` or `global.Parse`.

## For SDK authors: writing a custom cloud code SDK

### 1. Extend `CloudCodeRegistrar`

```typescript
import {
  CloudCodeRegistrar, RegistrarConfig, TriggerType, HookType,
  type TriggerHandlerMap, type HookHandlerMap,
} from 'parse-server/cloud';

export class MyCloudSDK extends CloudCodeRegistrar {
  private _appId: string = '';
  private _serverURL: string = '';
  private _masterKey: string = '';

  get appId(): string {
    return this._appId;
  }

  initialize(config: RegistrarConfig): void {
    this._appId = config.appId;
    this._serverURL = config.serverURL;
    this._masterKey = config.masterKey;
  }

  // Handler type is derived from the type constant automatically.
  // define(HookType.function, ...) requires FunctionHandler<P>
  // define(HookType.job, ...)      requires JobHandler<P>
  define<K extends HookType, P extends Record<string, unknown>>(
    type: K, name: string, handler: HookHandlerMap<P>[K], validator?: unknown
  ): void { /* store handler */ }

  // defineTrigger(TriggerType.beforeSave, ...)  requires ObjectTriggerHandler<T>
  // defineTrigger(TriggerType.beforeFind, ...)  requires QueryTriggerHandler
  // defineTrigger(TriggerType.afterFind, ...)   requires AfterFindHandler<T>
  defineTrigger<K extends TriggerType, T extends Record<string, unknown>>(
    type: K, className: string, handler: TriggerHandlerMap<T>[K], validator?: unknown
  ): void { /* store handler */ }

  removeAllHooks(): void { /* clear all stored handlers */ }
}
```

### 2. Build your SDK's public API on top

This is what your users interact with — design it however you want.
The handler type flows from the trigger constant through the generic:

```typescript
import {
  CloudCodeRegistrar, TriggerType, HookType,
  type FunctionHandler, type JobHandler,
  type ObjectTriggerHandler, type AfterFindHandler, type QueryTriggerHandler,
} from 'parse-server/cloud';

export class Cloud {
  private registrar: CloudCodeRegistrar;

  constructor(appId: string) {
    this.registrar = CloudCodeRegistrar.getInstance(appId);
  }

  // Consumer passes FunctionHandler<P> — registrar verifies it matches HookType.function
  define<P extends Record<string, unknown>>(name: string, handler: FunctionHandler<P>): void {
    this.registrar.define(HookType.function, name, handler);
  }

  // Consumer passes ObjectTriggerHandler<T> — registrar verifies it matches TriggerType.beforeSave
  beforeSave<T extends Record<string, unknown>>(className: string, handler: ObjectTriggerHandler<T>): void {
    this.registrar.defineTrigger(TriggerType.beforeSave, className, handler);
  }

  afterSave<T extends Record<string, unknown>>(className: string, handler: ObjectTriggerHandler<T>): void {
    this.registrar.defineTrigger(TriggerType.afterSave, className, handler);
  }

  // beforeFind takes a QueryTriggerHandler — no object generic needed
  beforeFind(className: string, handler: QueryTriggerHandler): void {
    this.registrar.defineTrigger(TriggerType.beforeFind, className, handler);
  }

  afterFind<T extends Record<string, unknown>>(className: string, handler: AfterFindHandler<T>): void {
    this.registrar.defineTrigger(TriggerType.afterFind, className, handler);
  }

  beforeDelete<T extends Record<string, unknown>>(className: string, handler: ObjectTriggerHandler<T>): void {
    this.registrar.defineTrigger(TriggerType.beforeDelete, className, handler);
  }

  job<P extends Record<string, unknown>>(name: string, handler: JobHandler<P>): void {
    this.registrar.define(HookType.job, name, handler);
  }
}
```

### 3. Start Parse Server with `cloud` pointing to the cloud code file

The `cloud` option tells Parse Server which file to load. Your SDK's hooks get registered when that file is imported.

```typescript
import ParseServer from 'parse-server';

const server = new ParseServer({
  appId: 'myApp',
  masterKey: 'secret',
  serverURL: 'http://localhost:1337/parse',
  cloud: './cloud/main.js',
});
await server.start();
```

### 4. Users write cloud code with your SDK

Handlers receive plain JSON — no `Parse.Object`, no `.get()`/`.set()`.
Pass a type parameter to get full autocomplete and type-checking:

```typescript
// cloud/main.js
import { Cloud } from 'my-parse-sdk';

const cloud = new Cloud('myApp');

interface HelloParams {
  name: string;
}

cloud.define<HelloParams>('hello', (req) => {
  return `Hello, ${req.params.name}!`; // req.params.name is string
});

interface GameScore {
  score: number;
  playerName: string;
}

cloud.beforeSave<GameScore>('GameScore', (req) => {
  if (req.object.score < 0) {       // req.object.score is number — no cast
    throw new Error('Score cannot be negative');
  }
});

// beforeFind handler — query-based, no object generic needed
cloud.beforeFind('GameScore', (req) => {
  return { ...req.query, limit: 100 }; // req.query is QueryDescriptor
});

// afterFind handler — objects are typed
cloud.afterFind<GameScore>('GameScore', (req) => {
  return req.objects.filter(o => o.score > 0); // o.score is number
});

cloud.job('cleanupOldScores', async (req) => {
  req.message('Starting cleanup…');
});
```

No `global.Parse`, no `parse/node` import, no parse-server internals.

## The `CloudCodeRegistrar` contract

| Method | Description |
|--------|-------------|
| `appId` | The application ID (available after `initialize`) |
| `initialize(config)` | Called by Parse Server at startup with `{ appId, masterKey, javascriptKey?, serverURL }` |
| `define(type, name, handler, validator?)` | Register a cloud function (`HookType.function`) or background job (`HookType.job`). Handler type is derived from `type`. |
| `defineTrigger(type, className, handler, validator?)` | Register a trigger. Handler type is derived from `type` — e.g. `beforeFind` requires `QueryTriggerHandler`, `beforeSave` requires `ObjectTriggerHandler<T>`. |
| `removeAllHooks()` | Unregister all hooks |

## Multi-app support

Each Parse Server instance gets its own registrar keyed by `appId`:

```typescript
const r1 = CloudCodeRegistrar.getInstance('app1');
const r2 = CloudCodeRegistrar.getInstance('app2');
```
