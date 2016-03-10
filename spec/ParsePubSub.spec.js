var ParsePubSub = require('../src/LiveQuery/ParsePubSub').ParsePubSub;

describe('ParsePubSub', function() {

  beforeEach(function(done) {
    // Mock RedisPubSub
    var mockRedisPubSub = {
      createPublisher: jasmine.createSpy('createPublisherRedis'),
      createSubscriber: jasmine.createSpy('createSubscriberRedis')
    };
    jasmine.mockLibrary('../src/LiveQuery/RedisPubSub', 'RedisPubSub', mockRedisPubSub);
    // Mock EventEmitterPubSub
    var mockEventEmitterPubSub = {
      createPublisher: jasmine.createSpy('createPublisherEventEmitter'),
      createSubscriber: jasmine.createSpy('createSubscriberEventEmitter')
    };
    jasmine.mockLibrary('../src/LiveQuery/EventEmitterPubSub', 'EventEmitterPubSub', mockEventEmitterPubSub);
    done();
  });

  it('can create redis publisher', function() {
    var publisher = ParsePubSub.createPublisher({
      redisURL: 'redisURL'
    });

    var RedisPubSub = require('../src/LiveQuery/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/LiveQuery/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createPublisher).toHaveBeenCalledWith('redisURL');
    expect(EventEmitterPubSub.createPublisher).not.toHaveBeenCalled();
  });

  it('can create event emitter publisher', function() {
    var publisher = ParsePubSub.createPublisher({});

    var RedisPubSub = require('../src/LiveQuery/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/LiveQuery/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createPublisher).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createPublisher).toHaveBeenCalled();
  });

  it('can create redis subscriber', function() {
    var subscriber = ParsePubSub.createSubscriber({
      redisURL: 'redisURL'
    });

    var RedisPubSub = require('../src/LiveQuery/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/LiveQuery/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).toHaveBeenCalledWith('redisURL');
    expect(EventEmitterPubSub.createSubscriber).not.toHaveBeenCalled();
  });

  it('can create event emitter subscriber', function() {
    var subscriptionInfos = ParsePubSub.createSubscriber({});

    var RedisPubSub = require('../src/LiveQuery/RedisPubSub').RedisPubSub;
    var EventEmitterPubSub = require('../src/LiveQuery/EventEmitterPubSub').EventEmitterPubSub;
    expect(RedisPubSub.createSubscriber).not.toHaveBeenCalled();
    expect(EventEmitterPubSub.createSubscriber).toHaveBeenCalled();
  });

  afterEach(function(){
    jasmine.restoreLibrary('../src/LiveQuery/RedisPubSub', 'RedisPubSub');
    jasmine.restoreLibrary('../src/LiveQuery/EventEmitterPubSub', 'EventEmitterPubSub');
  });
});
