'use strict';

describe('ParseLiveQuery', function () {
  it('can subscribe to query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });
  it('expect afterEvent create', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('Create');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
    });

    const query = new Parse.Query(TestObject);
    const subscription = await query.subscribe();
    subscription.on('create', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();
  });

  it('expect afterEvent payload', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('Update');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
      expect(req.original.get('foo')).toBeUndefined();
      done();
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await query.subscribe();
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('expect afterEvent enter', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('Enter');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
      expect(req.original.get('foo')).toBeUndefined();
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();
    subscription.on('enter', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    object.set('foo', 'bar');
    await object.save();
  });

  it('expect afterEvent leave', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('Leave');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBeUndefined();
      expect(req.original.get('foo')).toBe('bar');
    });

    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();
    subscription.on('leave', object => {
      expect(object.get('foo')).toBeUndefined();
      done();
    });

    object.unset('foo');
    await object.save();
  });

  it('expect afterEvent delete', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('Delete');
      expect(req.user).toBeUndefined();
      req.object.set('foo', 'bar');
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);

    const subscription = await query.subscribe();
    subscription.on('delete', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    await object.destroy();
  });

  it('can handle afterEvent modification', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      const current = req.object;
      current.set('foo', 'yolo');

      const original = req.original;
      original.set('yolo', 'foo');
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', (object, original) => {
      expect(object.get('foo')).toBe('yolo');
      expect(original.get('yolo')).toBe('foo');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can return different object in afterEvent', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', () => {
      const object = new Parse.Object('Yolo');
      return object;
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.className).toBe('Yolo');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle async afterEvent modification', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const parent = new TestObject();
    const child = new TestObject();
    child.set('bar', 'foo');
    await Parse.Object.saveAll([parent, child]);

    Parse.Cloud.afterLiveQueryEvent('TestObject', async req => {
      const current = req.object;
      const pointer = current.get('child');
      await pointer.fetch();
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', parent.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('child')).toBeDefined();
      expect(object.get('child').get('bar')).toBe('foo');
      done();
    });
    parent.set('child', child);
    await parent.save();
  });

  it('can handle afterEvent throw', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      const current = req.object;
      const original = req.original;

      setTimeout(() => {
        done();
      }, 2000);

      if (current.get('foo') != original.get('foo')) {
        throw "Don't pass an update trigger, or message";
      }
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', () => {
      fail('update should not have been called.');
    });
    subscription.on('error', () => {
      fail('error should not have been called.');
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle beforeConnect / beforeSubscribe hooks', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeSubscribe('TestObject', req => {
      expect(req.op).toBe('subscribe');
      expect(req.requestId).toBe(1);
      expect(req.query).toBeDefined();
      expect(req.user).toBeUndefined();
    });

    Parse.Cloud.beforeConnect(req => {
      expect(req.event).toBe('connect');
      expect(req.clients).toBe(0);
      expect(req.subscriptions).toBe(0);
      expect(req.useMasterKey).toBe(false);
      expect(req.installationId).toBeDefined();
      expect(req.user).toBeUndefined();
      expect(req.sessionToken).toBeUndefined();
      expect(req.client).toBeDefined();
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    
    subscription.on('update', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle beforeConnect error', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeConnect(() => {
      throw new Error('You shall not pass!');
    });
    Parse.LiveQuery.on('error', error => {
      expect(error).toBe('You shall not pass!');
      done();
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await query.subscribe();
  });

  it('can handle beforeSubscribe error', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeSubscribe(TestObject, () => {
      throw new Error('You shall not subscribe!');
    });
    Parse.LiveQuery.on('error', error => {
      expect(error).toBe('You shall not subscribe!');
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('error', error => {
      expect(error).toBe('You shall not subscribe!');
      done();
    });
  });

  it('handle invalid websocket payload length', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
      websocketTimeout: 100,
    });
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();

    // All control frames must have a payload length of 125 bytes or less.
    // https://tools.ietf.org/html/rfc6455#section-5.5
    //
    // 0x89 = 10001001 = ping
    // 0xfe = 11111110 = first bit is masking the remaining 7 are 1111110 or 126 the payload length
    // https://tools.ietf.org/html/rfc6455#section-5.2
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.socket._socket.write(Buffer.from([0x89, 0xfe]));

    subscription.on('update', async object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    // Wait for Websocket timeout to reconnect
    setTimeout(async () => {
      object.set({ foo: 'bar' });
      await object.save();
    }, 1000);
  });

  afterEach(async function (done) {
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.close();
    // Wait for live query client to disconnect
    setTimeout(() => {
      done();
    }, 1000);
  });
});
