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

    const entry = manager.getFunction('add');
    const result = await entry.handler({ params: { a: 2, b: 3 }, master: false, ip: '127.0.0.1', headers: {} });
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

    const entry = manager.getFunction('fail');
    await expectAsync(entry.handler({ params: {}, master: false, ip: '', headers: {} }))
      .toBeRejectedWithError(/boom/);
  });

  it('isHealthy returns true', async () => {
    const cloud = createMockCloudCode({ protocol: 'ParseCloud/1.0', hooks: { functions: [], triggers: [], jobs: [] } });
    const adapter = new InProcessAdapter(cloud);
    expect(await adapter.isHealthy()).toBe(true);
  });
});
