// spec/ExternalProcessAdapter.spec.js
const { ExternalProcessAdapter } = require('../lib/cloud-code/adapters/ExternalProcessAdapter');
const { CloudCodeManager } = require('../lib/cloud-code/CloudCodeManager');
const http = require('http');

function createMockCloudServer(manifest) {
  return new Promise((resolve, reject) => {
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
    server.on('error', (err) => reject(err));
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

describe('ExternalProcessAdapter', () => {
  it('derives name from webhookKey by default', () => {
    const adapter = new ExternalProcessAdapter('echo test', 'secret-key');
    expect(adapter.name).toBe('external-process-secret-k');
  });

  it('accepts a custom name', () => {
    const adapter = new ExternalProcessAdapter('echo test', 'secret-key', undefined, 'my-adapter');
    expect(adapter.name).toBe('my-adapter');
  });

  it('requires webhookKey', () => {
    expect(() => new ExternalProcessAdapter('echo test', '')).toThrowError(/webhookKey/);
  });

  it('shutdown resolves cleanly when no process started', async () => {
    const adapter = new ExternalProcessAdapter('echo test', 'key');
    await expectAsync(adapter.shutdown()).toBeResolved();
  });

  it('isHealthy returns true for running server', async () => {
    const manager = new CloudCodeManager();
    const { server, port } = await createMockCloudServer(
      { protocol: 'ParseCloud/1.0', hooks: { functions: [], triggers: [], jobs: [] } }
    );

    let adapter;
    try {
      const cmd = `node -e "process.stdout.write('PARSE_CLOUD_READY:${port}\\n'); setTimeout(() => {}, 60000)"`;
      adapter = new ExternalProcessAdapter(cmd, 'test-key', {
        startupTimeout: 5000,
        healthCheckInterval: 0,
      });
      const registry = manager.createRegistry(adapter.name);
      await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

      const healthy = await adapter.isHealthy();
      expect(healthy).toBe(true);
    } finally {
      if (adapter) {
        await adapter.shutdown();
      }
      await new Promise((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    }
  }, 10000);

  it('isHealthy returns false when server is down', async () => {
    const adapter = new ExternalProcessAdapter('echo test', 'test-key');
    // Port is 0 (default) since we never initialized — any HTTP request will fail
    const healthy = await adapter.isHealthy();
    expect(healthy).toBe(false);
  });

  it('cleans up process on manifest fetch failure', async () => {
    // Create a server that returns 500 for the manifest endpoint
    const server = await new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        if (req.url === '/' && req.method === 'GET') {
          res.writeHead(500);
          res.end('Internal Server Error');
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      srv.on('error', reject);
      srv.listen(0, () => resolve(srv));
    });
    const port = server.address().port;

    let adapter;
    try {
      const cmd = `node -e "process.stdout.write('PARSE_CLOUD_READY:${port}\\n'); setTimeout(() => {}, 60000)"`;
      adapter = new ExternalProcessAdapter(cmd, 'test-key', {
        startupTimeout: 5000,
        healthCheckInterval: 0,
      });
      const manager = new CloudCodeManager();
      const registry = manager.createRegistry(adapter.name);

      await expectAsync(
        adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' })
      ).toBeRejectedWithError(/500/);

      // After failure, the process should have been cleaned up by shutdown()
      // Calling shutdown again should resolve cleanly (process already null)
      await expectAsync(adapter.shutdown()).toBeResolved();
    } finally {
      await new Promise((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    }
  }, 10000);

  it('registers triggers including beforeSave', async () => {
    const manager = new CloudCodeManager();
    const { server, port } = await createMockCloudServer({
      protocol: 'ParseCloud/1.0',
      hooks: {
        functions: [],
        triggers: [
          { className: 'GameScore', triggerName: 'beforeSave' },
          { className: 'GameScore', triggerName: 'afterSave' },
        ],
        jobs: [],
      },
    });

    let adapter;
    try {
      const cmd = `node -e "process.stdout.write('PARSE_CLOUD_READY:${port}\\n'); setTimeout(() => {}, 60000)"`;
      adapter = new ExternalProcessAdapter(cmd, 'test-key', {
        startupTimeout: 5000,
        healthCheckInterval: 0,
      });
      const registry = manager.createRegistry(adapter.name);
      await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

      expect(manager.getTrigger('GameScore', 'beforeSave')).toBeDefined();
      expect(manager.getTrigger('GameScore', 'afterSave')).toBeDefined();
    } finally {
      if (adapter) {
        await adapter.shutdown();
      }
      await new Promise((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    }
  }, 10000);

  it('registers jobs from manifest', async () => {
    const manager = new CloudCodeManager();
    const { server, port } = await createMockCloudServer({
      protocol: 'ParseCloud/1.0',
      hooks: {
        functions: [],
        triggers: [],
        jobs: [{ name: 'cleanupJob' }],
      },
    });

    let adapter;
    try {
      const cmd = `node -e "process.stdout.write('PARSE_CLOUD_READY:${port}\\n'); setTimeout(() => {}, 60000)"`;
      adapter = new ExternalProcessAdapter(cmd, 'test-key', {
        startupTimeout: 5000,
        healthCheckInterval: 0,
      });
      const registry = manager.createRegistry(adapter.name);
      await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

      expect(manager.getJob('cleanupJob')).toBeDefined();
    } finally {
      if (adapter) {
        await adapter.shutdown();
      }
      await new Promise((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    }
  }, 10000);

  it('shutdown terminates a running process', async () => {
    const manager = new CloudCodeManager();
    const { server, port } = await createMockCloudServer(
      { protocol: 'ParseCloud/1.0', hooks: { functions: [], triggers: [], jobs: [] } }
    );

    let adapter;
    try {
      const cmd = `node -e "process.stdout.write('PARSE_CLOUD_READY:${port}\\n'); setTimeout(() => {}, 60000)"`;
      adapter = new ExternalProcessAdapter(cmd, 'test-key', {
        startupTimeout: 5000,
        healthCheckInterval: 0,
        shutdownTimeout: 2000,
      });
      const registry = manager.createRegistry(adapter.name);
      await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

      // Shutdown should terminate the spawned process
      await expectAsync(adapter.shutdown()).toBeResolved();

      // After shutdown, isHealthy should return false (port no longer served by our process)
      // and a second shutdown should be a no-op
      await expectAsync(adapter.shutdown()).toBeResolved();
    } finally {
      await new Promise((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    }
  }, 10000);

  it('spawns process and reads manifest', async () => {
    const manager = new CloudCodeManager();
    const { server, port } = await createMockCloudServer(
      { protocol: 'ParseCloud/1.0', hooks: { functions: [{ name: 'ext-fn' }], triggers: [], jobs: [] } }
    );

    let adapter;
    try {
      const cmd = `node -e "process.stdout.write('PARSE_CLOUD_READY:${port}\\n'); setTimeout(() => {}, 60000)"`;
      adapter = new ExternalProcessAdapter(cmd, 'test-key', {
        startupTimeout: 5000,
        healthCheckInterval: 0,
      });
      const registry = manager.createRegistry(adapter.name);
      await adapter.initialize(registry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

      expect(manager.getFunction('ext-fn')).toBeDefined();
    } finally {
      if (adapter) {
        await adapter.shutdown();
      }
      await new Promise((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    }
  }, 10000);
});
