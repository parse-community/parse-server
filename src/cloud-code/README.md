# Cloud Code SDK Adapter

Parse Server lets any JS SDK register cloud code hooks without depending on `parse/node` or `global.Parse`.

## For SDK authors: writing a custom cloud code SDK

### 1. Build your SDK's public API

Use `TriggerStore` static methods to register hooks directly. All methods take `appId` as the first argument — no setup needed.

```typescript
import { TriggerStore, TriggerType, HookType } from 'parse-server/cloud';

export class Cloud {
  constructor(private appId: string) {}

  define(name: string, handler: Function): void {
    TriggerStore.addFunction(this.appId, name, handler);
  }

  beforeSave(className: string, handler: Function): void {
    TriggerStore.addTrigger(this.appId, TriggerType.beforeSave, className, handler);
  }

  afterSave(className: string, handler: Function): void {
    TriggerStore.addTrigger(this.appId, TriggerType.afterSave, className, handler);
  }

  beforeFind(className: string, handler: Function): void {
    TriggerStore.addTrigger(this.appId, TriggerType.beforeFind, className, handler);
  }

  afterFind(className: string, handler: Function): void {
    TriggerStore.addTrigger(this.appId, TriggerType.afterFind, className, handler);
  }

  beforeDelete(className: string, handler: Function): void {
    TriggerStore.addTrigger(this.appId, TriggerType.beforeDelete, className, handler);
  }

  job(name: string, handler: Function): void {
    TriggerStore.addJob(this.appId, name, handler);
  }
}
```

### 2. Start Parse Server with `cloud` pointing to the cloud code file

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

### 3. Users write cloud code with your SDK

```typescript
// cloud/main.js
import { Cloud } from 'my-parse-sdk';

const cloud = new Cloud('myApp');

cloud.define('hello', (req) => {
  return `Hello, ${req.params.name}!`;
});

cloud.beforeSave('GameScore', (req) => {
  if (req.object.get('score') < 0) {
    throw new Error('Score cannot be negative');
  }
});

cloud.job('cleanupOldScores', async (req) => {
  req.message('Starting cleanup…');
});
```

No `global.Parse`, no `parse/node` import, no parse-server internals.

## The `TriggerStore` API

| Method | Description |
|--------|-------------|
| `TriggerStore.addFunction(appId, name, handler, validator?)` | Register a cloud function |
| `TriggerStore.addJob(appId, name, handler)` | Register a background job |
| `TriggerStore.addTrigger(appId, type, className, handler, validator?)` | Register a class trigger |
| `TriggerStore.addConnectTrigger(appId, type, handler, validator?)` | Register a connect trigger |
| `TriggerStore.addLiveQueryEventHandler(appId, handler)` | Register a live query event handler |
