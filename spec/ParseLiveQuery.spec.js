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
    subscription.on('update', async object => {
      expect(object.get('foo')).toBe('bar');
      done();
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
    subscription.on('update', async object => {
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
