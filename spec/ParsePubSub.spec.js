var ParsePubSub = require('../src/LiveQuery/ParsePubSub').ParsePubSub;

describe('ParsePubSub', function() {

  beforeEach(function(done) {
    // Mock RedisPubSub
    var mockRedisPubSub = {
      createPublisher: jasmine.createSpy('createPublisherRedis'),
      createSubscriber: jasmine.createSpy('createSubscriberRedis')
    };
    jasmine.mockLibrary('../src/Adapters/PubSub/RedisPubSub', 'RedisPubSub', mockRedisPubSub);
    // Mock EventEmitterPubSub
    var mockEventEmitterPubSub = {
      createPublisher: jasmine.createSpy('createPublisherEventEmitter'),
      createSubscriber: jasmine.createSpy('createSubscriberEventEmitter')
    };
    jasmine.mockLibrary('../src/Adapters/PubSub/EventEmitterPubSub', 'EventEmitterPubSub', mockEventEmitterPubSub);
    done();
  });

  it('can create redis publisher', function() {
    ParsePubSub.createPublisher({
      redisURL: 'redisURL'
    });

    var RedisPubSub = require('../src/Adapters/PubSub/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/Adapters/PubSub/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createPublisher).toHaveBeenCalledWith({redisURL: 'redisURL'});
    expect(EventEmitterPubSub.createPublisher).not.toHaveBeenCalled();
  });

  it('can create event emitter publisher', function() {
    ParsePubSub.createPublisher({});

    var RedisPubSub = require('../src/Adapters/PubSub/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/Adapters/PubSub/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createPublisher).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createPublisher).toHaveBeenCalled();
  });

  it('can create redis subscriber', function() {
    ParsePubSub.createSubscriber({
      redisURL: 'redisURL'
    });

    var RedisPubSub = require('../src/Adapters/PubSub/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/Adapters/PubSub/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).toHaveBeenCalledWith({redisURL: 'redisURL'});
    expect(EventEmitterPubSub.createSubscriber).not.toHaveBeenCalled();
  });

  it('can create event emitter subscriber', function() {
    ParsePubSub.createSubscriber({});

    var RedisPubSub = require('../src/Adapters/PubSub/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/Adapters/PubSub/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createSubscriber).toHaveBeenCalled();
  });

  it('can create publisher/sub with custom adapter', function() {
    const adapter =  {
      createPublisher: jasmine.createSpy('createPublisher'),
      createSubscriber: jasmine.createSpy('createSubscriber')
    }
    ParsePubSub.createPublisher({
      pubSubAdapter: adapter
    });
    expect(adapter.createPublisher).toHaveBeenCalled();

    ParsePubSub.createSubscriber({
      pubSubAdapter: adapter
    });
    expect(adapter.createSubscriber).toHaveBeenCalled();

    var RedisPubSub = require('../src/Adapters/PubSub/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/Adapters/PubSub/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(RedisPubSub.createPublisher).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createPublisher).not.toHaveBeenCalled();
  });

  it('can create publisher/sub with custom function adapter', function() {
    const adapter =  {
      createPublisher: jasmine.createSpy('createPublisher'),
      createSubscriber: jasmine.createSpy('createSubscriber')
    }
    ParsePubSub.createPublisher({
      pubSubAdapter: function() {
        return adapter;
      }
    });
    expect(adapter.createPublisher).toHaveBeenCalled();

    ParsePubSub.createSubscriber({
      pubSubAdapter: function() {
        return adapter;
      }
    });
    expect(adapter.createSubscriber).toHaveBeenCalled();

    var RedisPubSub = require('../src/Adapters/PubSub/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/Adapters/PubSub/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(RedisPubSub.createPublisher).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createPublisher).not.toHaveBeenCalled();
  });

  afterEach(function(){
    jasmine.restoreLibrary('../src/Adapters/PubSub/RedisPubSub', 'RedisPubSub');
    jasmine.restoreLibrary('../src/Adapters/PubSub/EventEmitterPubSub', 'EventEmitterPubSub');
  });
});
