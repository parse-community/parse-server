const ParsePubSub = require('../lib/LiveQuery/ParsePubSub').ParsePubSub;

describe('ParsePubSub', function () {
  beforeEach(function (done) {
    // Mock RedisPubSub
    const mockRedisPubSub = {
      createPublisher: jasmine.createSpy('createPublisherRedis'),
      createSubscriber: jasmine.createSpy('createSubscriberRedis'),
    };
    jasmine.mockLibrary('../lib/Adapters/PubSub/RedisPubSub', 'RedisPubSub', mockRedisPubSub);
    // Mock EventEmitterPubSub
    const mockEventEmitterPubSub = {
      createPublisher: jasmine.createSpy('createPublisherEventEmitter'),
      createSubscriber: jasmine.createSpy('createSubscriberEventEmitter'),
    };
    jasmine.mockLibrary(
      '../lib/Adapters/PubSub/EventEmitterPubSub',
      'EventEmitterPubSub',
      mockEventEmitterPubSub
    );
    done();
  });

  it('can create redis publisher', function () {
    ParsePubSub.createPublisher({
      redisURL: 'redisURL',
      redisOptions: { socket_keepalive: true },
    });

    const RedisPubSub = require('../lib/Adapters/PubSub/RedisPubSub').RedisPubSub;
    const EventEmitterPubSub = require('../lib/Adapters/PubSub/EventEmitterPubSub')
      .EventEmitterPubSub;
    expect(RedisPubSub.createPublisher).toHaveBeenCalledWith({
      redisURL: 'redisURL',
      redisOptions: { socket_keepalive: true },
    });
    expect(EventEmitterPubSub.createPublisher).not.toHaveBeenCalled();
  });

  it('can create event emitter publisher', function () {
    ParsePubSub.createPublisher({});

    const RedisPubSub = require('../lib/Adapters/PubSub/RedisPubSub').RedisPubSub;
    const EventEmitterPubSub = require('../lib/Adapters/PubSub/EventEmitterPubSub')
      .EventEmitterPubSub;
    expect(RedisPubSub.createPublisher).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createPublisher).toHaveBeenCalled();
  });

  it('can create redis subscriber', function () {
    ParsePubSub.createSubscriber({
      redisURL: 'redisURL',
      redisOptions: { socket_keepalive: true },
    });

    const RedisPubSub = require('../lib/Adapters/PubSub/RedisPubSub').RedisPubSub;
    const EventEmitterPubSub = require('../lib/Adapters/PubSub/EventEmitterPubSub')
      .EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).toHaveBeenCalledWith({
      redisURL: 'redisURL',
      redisOptions: { socket_keepalive: true },
    });
    expect(EventEmitterPubSub.createSubscriber).not.toHaveBeenCalled();
  });

  it('can create event emitter subscriber', function () {
    ParsePubSub.createSubscriber({});

    const RedisPubSub = require('../lib/Adapters/PubSub/RedisPubSub').RedisPubSub;
    const EventEmitterPubSub = require('../lib/Adapters/PubSub/EventEmitterPubSub')
      .EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createSubscriber).toHaveBeenCalled();
  });

  it('can create publisher/sub with custom adapter', function () {
    const adapter = {
      createPublisher: jasmine.createSpy('createPublisher'),
      createSubscriber: jasmine.createSpy('createSubscriber'),
    };
    ParsePubSub.createPublisher({
      pubSubAdapter: adapter,
    });
    expect(adapter.createPublisher).toHaveBeenCalled();

    ParsePubSub.createSubscriber({
      pubSubAdapter: adapter,
    });
    expect(adapter.createSubscriber).toHaveBeenCalled();

    const RedisPubSub = require('../lib/Adapters/PubSub/RedisPubSub').RedisPubSub;
    const EventEmitterPubSub = require('../lib/Adapters/PubSub/EventEmitterPubSub')
      .EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(RedisPubSub.createPublisher).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createPublisher).not.toHaveBeenCalled();
  });

  it('can create publisher/sub with custom function adapter', function () {
    const adapter = {
      createPublisher: jasmine.createSpy('createPublisher'),
      createSubscriber: jasmine.createSpy('createSubscriber'),
    };
    ParsePubSub.createPublisher({
      pubSubAdapter: function () {
        return adapter;
      },
    });
    expect(adapter.createPublisher).toHaveBeenCalled();

    ParsePubSub.createSubscriber({
      pubSubAdapter: function () {
        return adapter;
      },
    });
    expect(adapter.createSubscriber).toHaveBeenCalled();

    const RedisPubSub = require('../lib/Adapters/PubSub/RedisPubSub').RedisPubSub;
    const EventEmitterPubSub = require('../lib/Adapters/PubSub/EventEmitterPubSub')
      .EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(RedisPubSub.createPublisher).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createPublisher).not.toHaveBeenCalled();
  });

  afterEach(function () {
    jasmine.restoreLibrary('../lib/Adapters/PubSub/RedisPubSub', 'RedisPubSub');
    jasmine.restoreLibrary('../lib/Adapters/PubSub/EventEmitterPubSub', 'EventEmitterPubSub');
  });
});
