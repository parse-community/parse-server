'use strict';

describe('ParseLiveQuery query operation', function () {
  beforeEach(() => {
    Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
  });

  afterEach(async () => {
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    if (client) {
      await client.close();
    }
  });

  it('can execute query on existing subscription and receive results', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    // Create test objects
    const obj1 = new TestObject();
    obj1.set('name', 'object1');
    await obj1.save();

    const obj2 = new TestObject();
    obj2.set('name', 'object2');
    await obj2.save();

    // Subscribe to query
    const query = new Parse.Query(TestObject);
    const subscription = await query.subscribe();

    // Wait for subscription to be ready
    await new Promise(resolve => subscription.on('open', resolve));

    // Set up result listener
    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for result')), 5000);
      subscription.on('result', results => {
        clearTimeout(timeout);
        resolve(results);
      });
    });

    // Get the LiveQuery client and send query message
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    const message = {
      op: 'query',
      requestId: subscription.id,
    };
    client.socket.send(JSON.stringify(message));

    // Wait for and verify results
    const results = await resultPromise;
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results.some(r => r.name === 'object1')).toBe(true);
    expect(results.some(r => r.name === 'object2')).toBe(true);

    await subscription.unsubscribe();
  });

  it('respects field filtering (keys) when executing query', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    // Create test object with multiple fields
    const obj = new TestObject();
    obj.set('name', 'test');
    obj.set('secret', 'confidential');
    obj.set('public', 'visible');
    await obj.save();

    // Subscribe with field selection
    const query = new Parse.Query(TestObject);
    query.select('name', 'public'); // Only select these fields
    const subscription = await query.subscribe();

    // Wait for subscription to be ready
    await new Promise(resolve => subscription.on('open', resolve));

    // Set up result listener
    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
      subscription.on('result', results => {
        clearTimeout(timeout);
        resolve(results);
      });
    });

    // Send query message
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    const message = {
      op: 'query',
      requestId: subscription.id,
    };
    client.socket.send(JSON.stringify(message));

    // Wait for and verify results
    const results = await resultPromise;
    expect(results.length).toBe(1);
    const result = results[0];
    expect(result.name).toBe('test');
    expect(result.public).toBe('visible');
    expect(result.secret).toBeUndefined(); // Should be filtered out

    await subscription.unsubscribe();
  });

  it('runs beforeFind and afterFind triggers', async () => {
    let beforeFindCalled = false;
    let afterFindCalled = false;

    Parse.Cloud.beforeFind('TestObject', () => {
      beforeFindCalled = true;
    });

    Parse.Cloud.afterFind('TestObject', req => {
      afterFindCalled = true;
      return req.objects;
    });

    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    // Create test object
    const obj = new TestObject();
    obj.set('name', 'test');
    await obj.save();

    // Subscribe
    const query = new Parse.Query(TestObject);
    const subscription = await query.subscribe();

    // Wait for subscription to be ready
    await new Promise(resolve => subscription.on('open', resolve));

    // Set up result listener
    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
      subscription.on('result', results => {
        clearTimeout(timeout);
        resolve(results);
      });
    });

    // Send query message
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    const message = {
      op: 'query',
      requestId: subscription.id,
    };
    client.socket.send(JSON.stringify(message));

    // Wait for results
    await resultPromise;

    // Verify triggers were called
    expect(beforeFindCalled).toBe(true);
    expect(afterFindCalled).toBe(true);

    await subscription.unsubscribe();
  });

  it('handles query with where constraints', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    // Create multiple test objects
    const obj1 = new TestObject();
    obj1.set('name', 'apple');
    await obj1.save();

    const obj2 = new TestObject();
    obj2.set('name', 'banana');
    await obj2.save();

    const obj3 = new TestObject();
    obj3.set('name', 'cherry');
    await obj3.save();

    // Subscribe with where constraint
    const query = new Parse.Query(TestObject);
    query.equalTo('name', 'banana');
    const subscription = await query.subscribe();

    // Wait for subscription to be ready
    await new Promise(resolve => subscription.on('open', resolve));

    // Set up result listener
    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
      subscription.on('result', results => {
        clearTimeout(timeout);
        resolve(results);
      });
    });

    // Send query message
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    const message = {
      op: 'query',
      requestId: subscription.id,
    };
    client.socket.send(JSON.stringify(message));

    // Wait for and verify results - should only get banana
    const results = await resultPromise;
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('banana');

    await subscription.unsubscribe();
  });

  it('handles errors gracefully', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    // Create an object
    const obj = new TestObject();
    obj.set('name', 'test');
    await obj.save();

    // Subscribe
    const query = new Parse.Query(TestObject);
    const subscription = await query.subscribe();
    await new Promise(resolve => subscription.on('open', resolve));

    // Set up listeners for both result and error
    let resultReceived = false;
    let errorReceived = false;

    subscription.on('result', () => {
      resultReceived = true;
    });

    subscription.on('error', () => {
      errorReceived = true;
    });

    // Send query message
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    const message = {
      op: 'query',
      requestId: subscription.id,
    };
    client.socket.send(JSON.stringify(message));

    // Wait a bit for the response
    await new Promise(resolve => setTimeout(resolve, 500));

    // Should have received result (not error) since query is valid
    expect(resultReceived).toBe(true);
    expect(errorReceived).toBe(false);

    await subscription.unsubscribe();
  });
});
