'use strict';

const { CloudCodeManager } = require('../lib/cloud-code/CloudCodeManager');

describe('CloudCodeManager', () => {
  let manager;

  beforeEach(() => {
    manager = new CloudCodeManager();
  });

  // ─── Function Registration ───────────────────────────────────────────────────

  describe('defineFunction', () => {
    it('registers a function', () => {
      const handler = () => 'result';
      manager.defineFunction('myFunc', handler, 'source-a');
      const entry = manager.getFunction('myFunc');
      expect(entry).not.toBeNull();
      expect(entry.handler).toBe(handler);
      expect(entry.source).toBe('source-a');
    });

    it('allows overwriting a function from the same source', () => {
      const handler1 = () => 'v1';
      const handler2 = () => 'v2';
      manager.defineFunction('myFunc', handler1, 'source-a');
      manager.defineFunction('myFunc', handler2, 'source-a');
      expect(manager.getFunction('myFunc').handler).toBe(handler2);
    });

    it('throws when a different source tries to register the same function', () => {
      manager.defineFunction('myFunc', () => {}, 'source-a');
      expect(() => {
        manager.defineFunction('myFunc', () => {}, 'source-b');
      }).toThrowError(/already registered/i);
    });

    it('stores a validator with the function', () => {
      const handler = () => {};
      const validator = req => {};
      manager.defineFunction('myFunc', handler, 'source-a', validator);
      expect(manager.getFunction('myFunc').validator).toBe(validator);
    });

    it('returns null for an unknown function', () => {
      expect(manager.getFunction('unknown')).toBeNull();
    });
  });

  // ─── Trigger Registration ────────────────────────────────────────────────────

  describe('defineTrigger', () => {
    it('registers a trigger', () => {
      const handler = () => {};
      manager.defineTrigger('MyClass', 'beforeSave', handler, 'source-a');
      const entry = manager.getTrigger('MyClass', 'beforeSave');
      expect(entry).not.toBeNull();
      expect(entry.handler).toBe(handler);
      expect(entry.source).toBe('source-a');
    });

    it('allows overwriting a trigger from the same source', () => {
      const handler1 = () => {};
      const handler2 = () => {};
      manager.defineTrigger('MyClass', 'beforeSave', handler1, 'source-a');
      manager.defineTrigger('MyClass', 'beforeSave', handler2, 'source-a');
      expect(manager.getTrigger('MyClass', 'beforeSave').handler).toBe(handler2);
    });

    it('throws when a different source tries to register the same trigger', () => {
      manager.defineTrigger('MyClass', 'beforeSave', () => {}, 'source-a');
      expect(() => {
        manager.defineTrigger('MyClass', 'beforeSave', () => {}, 'source-b');
      }).toThrowError(/already registered/i);
    });

    it('stores a validator with the trigger', () => {
      const handler = () => {};
      const validator = { requireUser: true };
      manager.defineTrigger('MyClass', 'beforeSave', handler, 'source-a', validator);
      expect(manager.getTrigger('MyClass', 'beforeSave').validator).toBe(validator);
    });

    it('returns null for an unknown trigger', () => {
      expect(manager.getTrigger('MyClass', 'beforeSave')).toBeNull();
    });

    it('triggerExists returns true for a registered trigger', () => {
      manager.defineTrigger('MyClass', 'afterSave', () => {}, 'source-a');
      expect(manager.triggerExists('MyClass', 'afterSave')).toBe(true);
    });

    it('triggerExists returns false for an unregistered trigger', () => {
      expect(manager.triggerExists('MyClass', 'afterSave')).toBe(false);
    });
  });

  // ─── Validation Rules ────────────────────────────────────────────────────────

  describe('validation rules', () => {
    it('rejects beforeSave on _PushStatus', () => {
      expect(() => {
        manager.defineTrigger('_PushStatus', 'beforeSave', () => {}, 'source-a');
      }).toThrowError(/_PushStatus/);
    });

    it('allows afterSave on _PushStatus', () => {
      expect(() => {
        manager.defineTrigger('_PushStatus', 'afterSave', () => {}, 'source-a');
      }).not.toThrow();
    });

    it('rejects beforeDelete on _PushStatus', () => {
      expect(() => {
        manager.defineTrigger('_PushStatus', 'beforeDelete', () => {}, 'source-a');
      }).toThrowError(/_PushStatus/);
    });

    it('rejects beforeFind on _PushStatus', () => {
      expect(() => {
        manager.defineTrigger('_PushStatus', 'beforeFind', () => {}, 'source-a');
      }).toThrowError(/_PushStatus/);
    });

    it('rejects beforeSave on _Session', () => {
      expect(() => {
        manager.defineTrigger('_Session', 'beforeSave', () => {}, 'source-a');
      }).toThrowError(/_Session/);
    });

    it('rejects afterSave on _Session', () => {
      expect(() => {
        manager.defineTrigger('_Session', 'afterSave', () => {}, 'source-a');
      }).toThrowError(/_Session/);
    });

    it('allows afterLogout on _Session', () => {
      expect(() => {
        manager.defineTrigger('_Session', 'afterLogout', () => {}, 'source-a');
      }).not.toThrow();
    });

    it('rejects beforeLogin on a non-_User class', () => {
      expect(() => {
        manager.defineTrigger('SomeClass', 'beforeLogin', () => {}, 'source-a');
      }).toThrowError(/_User/);
    });

    it('allows beforeLogin on _User', () => {
      expect(() => {
        manager.defineTrigger('_User', 'beforeLogin', () => {}, 'source-a');
      }).not.toThrow();
    });

    it('rejects afterLogin on a non-_User class', () => {
      expect(() => {
        manager.defineTrigger('SomeClass', 'afterLogin', () => {}, 'source-a');
      }).toThrowError(/_User/);
    });

    it('allows afterLogin on _User', () => {
      expect(() => {
        manager.defineTrigger('_User', 'afterLogin', () => {}, 'source-a');
      }).not.toThrow();
    });

    it('rejects beforePasswordResetRequest on a non-_User class', () => {
      expect(() => {
        manager.defineTrigger('SomeClass', 'beforePasswordResetRequest', () => {}, 'source-a');
      }).toThrowError(/_User/);
    });

    it('allows beforePasswordResetRequest on _User', () => {
      expect(() => {
        manager.defineTrigger('_User', 'beforePasswordResetRequest', () => {}, 'source-a');
      }).not.toThrow();
    });

    it('rejects afterLogout on a non-_Session class', () => {
      expect(() => {
        manager.defineTrigger('_User', 'afterLogout', () => {}, 'source-a');
      }).toThrowError(/_Session/);
    });

    it('allows beforeSave on @File virtual className', () => {
      expect(() => {
        manager.defineTrigger('@File', 'beforeSave', () => {}, 'source-a');
      }).not.toThrow();
    });

    it('allows beforeConnect on @Connect virtual className', () => {
      expect(() => {
        manager.defineTrigger('@Connect', 'beforeConnect', () => {}, 'source-a');
      }).not.toThrow();
    });
  });

  // ─── Job Registration ─────────────────────────────────────────────────────────

  describe('defineJob', () => {
    it('registers a job', () => {
      const handler = () => {};
      manager.defineJob('myJob', handler, 'source-a');
      const entry = manager.getJob('myJob');
      expect(entry).not.toBeNull();
      expect(entry.handler).toBe(handler);
      expect(entry.source).toBe('source-a');
    });

    it('allows overwriting a job from the same source', () => {
      const handler1 = () => {};
      const handler2 = () => {};
      manager.defineJob('myJob', handler1, 'source-a');
      manager.defineJob('myJob', handler2, 'source-a');
      expect(manager.getJob('myJob').handler).toBe(handler2);
    });

    it('throws when a different source tries to register the same job', () => {
      manager.defineJob('myJob', () => {}, 'source-a');
      expect(() => {
        manager.defineJob('myJob', () => {}, 'source-b');
      }).toThrowError(/already registered/i);
    });

    it('returns null for an unknown job', () => {
      expect(manager.getJob('unknown')).toBeNull();
    });

    it('getJobs returns all jobs as a Map', () => {
      manager.defineJob('job1', () => {}, 'source-a');
      manager.defineJob('job2', () => {}, 'source-a');
      const jobs = manager.getJobs();
      expect(jobs instanceof Map).toBe(true);
      expect(jobs.size).toBe(2);
      expect(jobs.has('job1')).toBe(true);
      expect(jobs.has('job2')).toBe(true);
    });

    it('getJobsObject returns all jobs as a plain object', () => {
      manager.defineJob('job1', () => {}, 'source-a');
      manager.defineJob('job2', () => {}, 'source-a');
      const jobs = manager.getJobsObject();
      expect(typeof jobs).toBe('object');
      expect(jobs['job1']).toBeDefined();
      expect(jobs['job2']).toBeDefined();
    });
  });

  // ─── Live Query Handlers ─────────────────────────────────────────────────────

  describe('defineLiveQueryHandler', () => {
    it('registers a live query handler', () => {
      const handler = data => {};
      manager.defineLiveQueryHandler(handler, 'source-a');
      // runLiveQueryEventHandlers should call the handler
      let called = false;
      const h = data => { called = true; };
      manager.defineLiveQueryHandler(h, 'source-a');
      manager.runLiveQueryEventHandlers({ event: 'test' });
      expect(called).toBe(true);
    });

    it('runs all live query handlers when runLiveQueryEventHandlers is called', () => {
      const calls = [];
      manager.defineLiveQueryHandler(data => calls.push('h1'), 'source-a');
      manager.defineLiveQueryHandler(data => calls.push('h2'), 'source-b');
      manager.runLiveQueryEventHandlers({ event: 'test' });
      expect(calls).toEqual(['h1', 'h2']);
    });

    it('passes data to each live query handler', () => {
      let received;
      manager.defineLiveQueryHandler(data => { received = data; }, 'source-a');
      manager.runLiveQueryEventHandlers({ event: 'create', objectId: '123' });
      expect(received).toEqual({ event: 'create', objectId: '123' });
    });
  });

  // ─── Lookup Methods ──────────────────────────────────────────────────────────

  describe('getFunctionNames', () => {
    it('returns an empty array when no functions are registered', () => {
      expect(manager.getFunctionNames()).toEqual([]);
    });

    it('returns names of all registered functions', () => {
      manager.defineFunction('funcA', () => {}, 'source-a');
      manager.defineFunction('funcB', () => {}, 'source-a');
      const names = manager.getFunctionNames();
      expect(names.sort()).toEqual(['funcA', 'funcB']);
    });
  });

  describe('getValidator', () => {
    it('returns the validator for a function', () => {
      const validator = req => {};
      manager.defineFunction('myFunc', () => {}, 'source-a', validator);
      expect(manager.getValidator('myFunc')).toBe(validator);
    });

    it('returns null when function has no validator', () => {
      manager.defineFunction('myFunc', () => {}, 'source-a');
      expect(manager.getValidator('myFunc')).toBeNull();
    });

    it('returns null when function does not exist', () => {
      expect(manager.getValidator('unknown')).toBeNull();
    });
  });

  // ─── Removal ─────────────────────────────────────────────────────────────────

  describe('removeFunction', () => {
    it('removes a registered function', () => {
      manager.defineFunction('myFunc', () => {}, 'source-a');
      manager.removeFunction('myFunc');
      expect(manager.getFunction('myFunc')).toBeNull();
    });

    it('does not throw when removing an unknown function', () => {
      expect(() => manager.removeFunction('unknown')).not.toThrow();
    });
  });

  describe('removeTrigger', () => {
    it('removes a registered trigger', () => {
      manager.defineTrigger('MyClass', 'beforeSave', () => {}, 'source-a');
      manager.removeTrigger('MyClass', 'beforeSave');
      expect(manager.getTrigger('MyClass', 'beforeSave')).toBeNull();
    });

    it('does not throw when removing an unknown trigger', () => {
      expect(() => manager.removeTrigger('MyClass', 'beforeSave')).not.toThrow();
    });
  });

  describe('unregisterAll', () => {
    it('removes all hooks registered by a given source', () => {
      manager.defineFunction('funcA', () => {}, 'source-a');
      manager.defineFunction('funcB', () => {}, 'source-b');
      manager.defineTrigger('MyClass', 'beforeSave', () => {}, 'source-a');
      manager.defineJob('jobA', () => {}, 'source-a');

      manager.unregisterAll('source-a');

      expect(manager.getFunction('funcA')).toBeNull();
      expect(manager.getFunction('funcB')).not.toBeNull();
      expect(manager.getTrigger('MyClass', 'beforeSave')).toBeNull();
      expect(manager.getJob('jobA')).toBeNull();
    });

    it('removes live query handlers registered by a given source', () => {
      const calls = [];
      manager.defineLiveQueryHandler(() => calls.push('a'), 'source-a');
      manager.defineLiveQueryHandler(() => calls.push('b'), 'source-b');

      manager.unregisterAll('source-a');
      manager.runLiveQueryEventHandlers({});

      expect(calls).toEqual(['b']);
    });
  });

  describe('clearAll', () => {
    it('removes all registered hooks regardless of source', () => {
      manager.defineFunction('funcA', () => {}, 'source-a');
      manager.defineFunction('funcB', () => {}, 'source-b');
      manager.defineTrigger('MyClass', 'beforeSave', () => {}, 'source-a');
      manager.defineJob('jobA', () => {}, 'source-a');

      manager.clearAll();

      expect(manager.getFunction('funcA')).toBeNull();
      expect(manager.getFunction('funcB')).toBeNull();
      expect(manager.getTrigger('MyClass', 'beforeSave')).toBeNull();
      expect(manager.getJob('jobA')).toBeNull();
      expect(manager.getFunctionNames()).toEqual([]);
    });

    it('clears live query handlers', () => {
      const calls = [];
      manager.defineLiveQueryHandler(() => calls.push('a'), 'source-a');
      manager.clearAll();
      manager.runLiveQueryEventHandlers({});
      expect(calls).toEqual([]);
    });
  });

  // ─── Registry Scoping ────────────────────────────────────────────────────────

  describe('createRegistry', () => {
    it('returns a registry scoped to the given source', () => {
      const registry = manager.createRegistry('source-a');
      const handler = () => {};
      registry.defineFunction('myFunc', handler);
      expect(manager.getFunction('myFunc').source).toBe('source-a');
    });

    it('scoped registry defineFunction stores the handler correctly', () => {
      const registry = manager.createRegistry('source-a');
      const handler = () => 'result';
      registry.defineFunction('myFunc', handler);
      expect(manager.getFunction('myFunc').handler).toBe(handler);
    });

    it('scoped registry defineTrigger stores the trigger correctly', () => {
      const registry = manager.createRegistry('source-a');
      const handler = () => {};
      registry.defineTrigger('MyClass', 'beforeSave', handler);
      expect(manager.getTrigger('MyClass', 'beforeSave').source).toBe('source-a');
    });

    it('scoped registry defineJob stores the job correctly', () => {
      const registry = manager.createRegistry('source-a');
      const handler = () => {};
      registry.defineJob('myJob', handler);
      expect(manager.getJob('myJob').source).toBe('source-a');
    });

    it('scoped registry defineLiveQueryHandler registers the handler', () => {
      const registry = manager.createRegistry('source-a');
      const calls = [];
      registry.defineLiveQueryHandler(data => calls.push(data));
      manager.runLiveQueryEventHandlers({ event: 'test' });
      expect(calls.length).toBe(1);
    });

    it('scoped registry conflict detection uses the scoped source', () => {
      const registryA = manager.createRegistry('source-a');
      const registryB = manager.createRegistry('source-b');
      registryA.defineFunction('myFunc', () => {});
      expect(() => {
        registryB.defineFunction('myFunc', () => {});
      }).toThrowError(/already registered/i);
    });
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('calls initialize on each adapter', async () => {
      const calls = [];
      const adapterA = {
        name: 'adapter-a',
        initialize: async (registry, config) => { calls.push('a'); },
        isHealthy: async () => true,
        shutdown: async () => {},
      };
      const adapterB = {
        name: 'adapter-b',
        initialize: async (registry, config) => { calls.push('b'); },
        isHealthy: async () => true,
        shutdown: async () => {},
      };
      const config = { appId: 'testApp', masterKey: 'key', serverURL: 'http://localhost:1337/parse' };
      await manager.initialize([adapterA, adapterB], config);
      expect(calls).toEqual(['a', 'b']);
    });

    it('passes a scoped registry to each adapter', async () => {
      let capturedRegistry;
      const adapter = {
        name: 'test-adapter',
        initialize: async (registry, config) => {
          capturedRegistry = registry;
          registry.defineFunction('adapterFunc', () => {});
        },
        isHealthy: async () => true,
        shutdown: async () => {},
      };
      const config = { appId: 'testApp', masterKey: 'key', serverURL: 'http://localhost:1337/parse' };
      await manager.initialize([adapter], config);
      expect(manager.getFunction('adapterFunc')).not.toBeNull();
      expect(manager.getFunction('adapterFunc').source).toBe('test-adapter');
    });

    it('throws when two adapters have the same name', async () => {
      const adapterA = {
        name: 'duplicate',
        initialize: async () => {},
        isHealthy: async () => true,
        shutdown: async () => {},
      };
      const adapterB = {
        name: 'duplicate',
        initialize: async () => {},
        isHealthy: async () => true,
        shutdown: async () => {},
      };
      const config = { appId: 'testApp', masterKey: 'key', serverURL: 'http://localhost:1337/parse' };
      await expectAsync(manager.initialize([adapterA, adapterB], config)).toBeRejectedWithError(/duplicate/i);
    });
  });

  describe('shutdown', () => {
    it('calls shutdown on each initialized adapter', async () => {
      const calls = [];
      const adapter = {
        name: 'adapter-a',
        initialize: async () => {},
        isHealthy: async () => true,
        shutdown: async () => { calls.push('shutdown'); },
      };
      const config = { appId: 'testApp', masterKey: 'key', serverURL: 'http://localhost:1337/parse' };
      await manager.initialize([adapter], config);
      await manager.shutdown();
      expect(calls).toEqual(['shutdown']);
    });
  });

  describe('healthCheck', () => {
    it('returns true when all adapters are healthy', async () => {
      const adapter = {
        name: 'adapter-a',
        initialize: async () => {},
        isHealthy: async () => true,
        shutdown: async () => {},
      };
      const config = { appId: 'testApp', masterKey: 'key', serverURL: 'http://localhost:1337/parse' };
      await manager.initialize([adapter], config);
      const healthy = await manager.healthCheck();
      expect(healthy).toBe(true);
    });

    it('returns false when any adapter is unhealthy', async () => {
      const adapterA = {
        name: 'adapter-a',
        initialize: async () => {},
        isHealthy: async () => true,
        shutdown: async () => {},
      };
      const adapterB = {
        name: 'adapter-b',
        initialize: async () => {},
        isHealthy: async () => false,
        shutdown: async () => {},
      };
      const config = { appId: 'testApp', masterKey: 'key', serverURL: 'http://localhost:1337/parse' };
      await manager.initialize([adapterA, adapterB], config);
      const healthy = await manager.healthCheck();
      expect(healthy).toBe(false);
    });

    it('returns true when no adapters are registered', async () => {
      const healthy = await manager.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  // ─── Validators for triggers ─────────────────────────────────────────────────

  describe('trigger validators', () => {
    it('stores a function validator on a trigger', () => {
      const handler = () => {};
      const validator = req => {};
      manager.defineTrigger('MyClass', 'beforeSave', handler, 'source-a', validator);
      expect(manager.getTrigger('MyClass', 'beforeSave').validator).toBe(validator);
    });

    it('stores an object validator on a trigger', () => {
      const handler = () => {};
      const validator = { requireUser: true };
      manager.defineTrigger('MyClass', 'beforeSave', handler, 'source-a', validator);
      expect(manager.getTrigger('MyClass', 'beforeSave').validator).toBe(validator);
    });

    it('stores undefined validator when no validator provided', () => {
      const handler = () => {};
      manager.defineTrigger('MyClass', 'beforeSave', handler, 'source-a');
      const entry = manager.getTrigger('MyClass', 'beforeSave');
      expect(entry.validator).toBeUndefined();
    });
  });
});
