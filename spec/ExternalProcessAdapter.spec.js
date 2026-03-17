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
