'use strict';

describe('ParseLiveQuery', function() {
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

  afterEach(async function(done) {
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.close();
    // Wait for live query client to disconnect
    setTimeout(() => {
      done();
    }, 1000);
  });
});
