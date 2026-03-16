# Cloud Code Adapters

Parse Server supports pluggable cloud code adapters. You can write cloud code in any language, use any SDK, or bring your own adapter implementation.

## Quick Start

### Option A: In-Process (TypeScript/JavaScript)

Pass any object with a `getRouter()` method as the `cloud` option. Any SDK that implements the router interface works — see [Building a Custom In-Process SDK](#building-a-custom-in-process-sdk) below.

```typescript
import ParseServer from 'parse-server';

const cloud = createMyCloudCode(); // any object with getRouter()

new ParseServer({
  databaseURI: 'mongodb://localhost:27017/myapp',
  appId: 'myapp',
  masterKey: 'secret',
  cloud: cloud, // detected via getRouter()
});
```

### Option B: External Process (Any Language)

Spawn a separate process that speaks the ParseCloud/1.0 HTTP protocol:

```javascript
new ParseServer({
  databaseURI: 'mongodb://localhost:27017/myapp',
  appId: 'myapp',
  masterKey: 'secret',
  cloudCodeCommand: 'swift run CloudCode',
  webhookKey: 'your-secret-key',
});
```

The process receives config via environment variables and communicates via HTTP webhooks.

### Option C: Custom Adapter

Pass any object implementing the `CloudCodeAdapter` interface:

```typescript
new ParseServer({
  appId: 'myapp',
  masterKey: 'secret',
  cloudCodeAdapters: [myCustomAdapter],
});
```

All three options compose — you can use them simultaneously. Hook conflicts (same function/trigger registered by multiple adapters) throw at startup.

---

## Building a Custom In-Process SDK

To build a JavaScript/TypeScript cloud code SDK that integrates with Parse Server in-process, your library needs to expose a router with three methods.

### Required Interface

```typescript
interface InProcessCloudCode {
  getRouter(): {
    /** Return all registered hooks */
    getManifest(): {
      protocol: string; // e.g. "ParseCloud/1.0"
      hooks: {
        functions: Array<{ name: string }>;
        triggers: Array<{ className: string; triggerName: string }>;
        jobs: Array<{ name: string }>;
      };
    };

    /** Dispatch a cloud function call */
    dispatchFunction(
      name: string,
      body: Record<string, unknown>
    ): Promise<{ success: unknown } | { error: { code: number; message: string } }>;

    /** Dispatch a trigger */
    dispatchTrigger(
      className: string,
      triggerName: string,
      body: Record<string, unknown>
    ): Promise<{ success: unknown } | { error: { code: number; message: string } }>;

    /** Dispatch a job */
    dispatchJob(
      name: string,
      body: Record<string, unknown>
    ): Promise<{ success: unknown } | { error: { code: number; message: string } }>;
  };
}
```

Parse Server detects your object via duck typing: if `cloud` has a `getRouter()` method, it's treated as an `InProcessCloudCode` instance.

### How It Works

1. Parse Server calls `cloud.getRouter().getManifest()` at startup
2. For each hook in the manifest, a bridge handler is registered
3. When a request comes in, Parse Server serializes it to a webhook body and calls `dispatchFunction`/`dispatchTrigger`/`dispatchJob`
4. Your SDK processes the request and returns `{ success: result }` or `{ error: { code, message } }`

### Webhook Body Format

The body passed to `dispatch*` methods contains:

```typescript
{
  master: boolean,        // Was master key used?
  ip: string,             // Client IP
  headers: object,        // HTTP headers
  installationId: string, // Client installation ID
  user?: object,          // Authenticated user (JSON)
  params?: object,        // Function/job parameters

  // Trigger-specific:
  object?: object,        // The object being saved/deleted (JSON)
  original?: object,      // Original object before changes (JSON)
  context?: object,       // Custom context passed between triggers

  // Query triggers:
  query?: {
    className: string,
    where: object,
    limit: number,
    skip: number,
    include: string,
    keys: string,
    order: string,
  },

  // File triggers:
  file?: object,
  fileSize?: number,

  // Job-specific:
  jobId?: string,
}
```

### Response Format

All dispatch methods return one of:

```typescript
// Success
{ success: <any value> }

// Error — thrown as Parse.Error on the server side
{ error: { code: number, message: string } }
```

For `beforeSave` triggers specifically:
- `{ success: {} }` (empty object) means "accept the original, no changes"
- `{ success: { field: value, ... } }` means "apply these field changes"

### Minimal Example

A bare-bones SDK in ~40 lines:

```typescript
class MyCloudSDK {
  private functions = new Map<string, (body: any) => Promise<any>>();

  define(name: string, handler: (body: any) => Promise<any>) {
    this.functions.set(name, handler);
    return this;
  }

  getRouter() {
    const functions = this.functions;
    return {
      getManifest() {
        return {
          protocol: 'MySDK/1.0',
          hooks: {
            functions: Array.from(functions.keys()).map(name => ({ name })),
            triggers: [],
            jobs: [],
          },
        };
      },
      async dispatchFunction(name: string, body: Record<string, unknown>) {
        const handler = functions.get(name);
        if (!handler) return { error: { code: 141, message: `Unknown function: ${name}` } };
        try {
          const result = await handler(body);
          return { success: result };
        } catch (e: any) {
          return { error: { code: e.code || 141, message: e.message } };
        }
      },
      async dispatchTrigger() { return { success: {} }; },
      async dispatchJob() { return { success: null }; },
    };
  }
}

// Usage:
const cloud = new MyCloudSDK();
cloud.define('hello', async (body) => `Hello, ${body.params.name}!`);

new ParseServer({ cloud: cloud, ... });
```

---

## Building an External Process SDK (Any Language)

To build a cloud code SDK in Swift, C#, Go, Python, or any language, your process needs to:

1. Start an HTTP server
2. Print `PARSE_CLOUD_READY:<port>` to stdout
3. Serve a manifest at `GET /`
4. Handle webhook requests at `POST /functions/:name`, `POST /triggers/:className/:triggerName`, `POST /jobs/:name`
5. Respond to health checks at `GET /health`

### Environment Variables

Parse Server passes these to your process:

| Variable | Description |
|----------|-------------|
| `PARSE_SERVER_URL` | Parse Server URL (e.g. `http://localhost:1337/parse`) |
| `PARSE_APPLICATION_ID` | App ID |
| `PARSE_MASTER_KEY` | Master key |
| `PARSE_WEBHOOK_KEY` | Key for authenticating requests (check `X-Parse-Webhook-Key` header) |
| `PARSE_CLOUD_PORT` | Suggested port (`0` = OS-assigned) |

### Protocol

**Startup:** Print `PARSE_CLOUD_READY:<port>` to stdout once your HTTP server is listening.

**Manifest** (`GET /`):

```json
{
  "protocol": "ParseCloud/1.0",
  "hooks": {
    "functions": [{ "name": "hello" }],
    "triggers": [{ "className": "Todo", "triggerName": "beforeSave" }],
    "jobs": [{ "name": "cleanup" }]
  }
}
```

**Webhook requests** (`POST /functions/:name`, etc.):

- Request body: same webhook body format described above
- Request header: `X-Parse-Webhook-Key` must match your `PARSE_WEBHOOK_KEY`
- Response: `{ "success": <value> }` or `{ "error": { "code": 142, "message": "..." } }`

**Health check** (`GET /health`): Return `200 OK`.

**Shutdown:** Parse Server sends `SIGTERM`. Clean up and exit. After the configured timeout (default 5s), `SIGKILL` is sent.

### Trigger Names

| Trigger | className |
|---------|-----------|
| `beforeSave`, `afterSave`, `beforeDelete`, `afterDelete`, `beforeFind`, `afterFind` | Any class name (e.g. `Todo`, `_User`) |
| `beforeSave`, `afterSave`, `beforeDelete`, `afterDelete` on files | `@File` |
| `beforeSave`, `afterSave` on config | `@Config` |
| `beforeLogin`, `afterLogin`, `beforePasswordResetRequest` | `_User` |
| `afterLogout` | `_Session` |
| `beforeConnect` | `@Connect` |
| `beforeSubscribe`, `afterEvent` | Any class name |

### Example: Go

```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "os"
)

func main() {
    mux := http.NewServeMux()

    mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
        json.NewEncoder(w).Encode(map[string]any{
            "protocol": "ParseCloud/1.0",
            "hooks": map[string]any{
                "functions": []map[string]string{{"name": "hello"}},
                "triggers": []any{},
                "jobs":     []any{},
            },
        })
    })

    mux.HandleFunc("POST /functions/hello", func(w http.ResponseWriter, r *http.Request) {
        if r.Header.Get("X-Parse-Webhook-Key") != os.Getenv("PARSE_WEBHOOK_KEY") {
            http.Error(w, "Unauthorized", 401)
            return
        }
        var body map[string]any
        json.NewDecoder(r.Body).Decode(&body)
        params, _ := body["params"].(map[string]any)
        name, _ := params["name"].(string)
        json.NewEncoder(w).Encode(map[string]any{
            "success": fmt.Sprintf("Hello, %s!", name),
        })
    })

    mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("OK"))
    })

    listener, _ := net.Listen("tcp", ":0")
    port := listener.Addr().(*net.TCPAddr).Port
    fmt.Printf("PARSE_CLOUD_READY:%d\n", port)
    http.Serve(listener, mux)
}
```

```javascript
// parse-server config
new ParseServer({
  cloudCodeCommand: 'go run ./cloud-code',
  webhookKey: 'my-secret-key',
  // ...
});
```

---

## Building a Fully Custom Adapter

For complete control, implement the `CloudCodeAdapter` interface directly:

```typescript
import type { CloudCodeAdapter, CloudCodeRegistry, ParseServerConfig } from 'parse-server/cloud-code/types';

class MyAdapter implements CloudCodeAdapter {
  readonly name = 'my-adapter';

  async initialize(registry: CloudCodeRegistry, config: ParseServerConfig): Promise<void> {
    // Register hooks using the registry
    registry.defineFunction('myFunction', async (request) => {
      return { result: 'hello' };
    });

    registry.defineTrigger('Todo', 'beforeSave', async (request) => {
      // request.object, request.user, etc. are Parse Server internal objects
      // Return value or throw to reject
    });

    registry.defineJob('myJob', async (request) => {
      // Long-running work
    });

    registry.defineLiveQueryHandler((data) => {
      // Handle live query events
    });
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async shutdown(): Promise<void> {
    // Clean up resources
  }
}

// Usage:
new ParseServer({
  cloudCodeAdapters: [new MyAdapter()],
  // ...
});
```

### Registry API

| Method | Description |
|--------|-------------|
| `defineFunction(name, handler, validator?)` | Register a cloud function |
| `defineTrigger(className, triggerName, handler, validator?)` | Register a trigger |
| `defineJob(name, handler)` | Register a background job |
| `defineLiveQueryHandler(handler)` | Register a live query event handler |

### Notes

- The `handler` receives Parse Server's internal request object (with `Parse.Object` instances, etc.)
- This is a lower-level API than the InProcess router interface — you work with Parse Server internals directly
- Validators (optional) support `{ requireUser: true, requireMaster: true, fields: {...}, rateLimit: {...} }` — same as `Parse.Cloud.define` validators
- Multiple custom adapters can coexist — each gets a unique source name from `adapter.name`
- Hook conflicts between adapters throw at startup
