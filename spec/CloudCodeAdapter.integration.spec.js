'use strict';

const { CloudCodeManager } = require('../lib/cloud-code/CloudCodeManager');
const { InProcessAdapter } = require('../lib/cloud-code/adapters/InProcessAdapter');

describe('Cloud Code Adapter Integration', () => {
  describe('composable adapters', () => {
    it('supports multiple adapters registering different hooks', async () => {
      const manager = new CloudCodeManager();

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

      const inProcessAdapter = new InProcessAdapter(inProcessCloud);
      const inProcessRegistry = manager.createRegistry(inProcessAdapter.name);
      await inProcessAdapter.initialize(inProcessRegistry, { appId: 'test', masterKey: 'mk', serverURL: 'http://localhost' });

      // Simulate legacy registration via manager directly
      manager.defineFunction('legacyFn', () => 'from-legacy', 'legacy');

      const legacyEntry = manager.getFunction('legacyFn');
      expect(legacyEntry).toBeDefined();
      expect(manager.getFunction('inProcessFn')).toBeDefined();
      expect(manager.getFunctionNames().sort()).toEqual(['inProcessFn', 'legacyFn']);
    });

    it('throws on conflict between adapters', async () => {
      const manager = new CloudCodeManager();

      // Register a function from "legacy" source
      manager.defineFunction('shared', () => 'from-legacy', 'legacy');

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
      ).toBeRejectedWithError(/already registered/);
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
      manager.defineFunction('fn', () => 'first', 'adapter-a');
      manager.unregisterAll('adapter-a');

      expect(() => {
        manager.defineFunction('fn', () => 'second', 'adapter-b');
      }).not.toThrow();
      expect(manager.getFunction('fn')).toBeDefined();
    });
  });
});
