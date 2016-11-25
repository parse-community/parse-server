var RedisPubSub = require('../src/Adapters/PubSub/RedisPubSub').RedisPubSub;

describe('RedisPubSub', function() {

  beforeEach(function(done) {
    // Mock redis
    var createClient = jasmine.createSpy('createClient');
    jasmine.mockLibrary('redis', 'createClient', createClient);
    done();
  });

  it('can create publisher', function() {
    RedisPubSub.createPublisher({redisURL: 'redisAddress'});

    var redis = require('redis');
    expect(redis.createClient).toHaveBeenCalledWith('redisAddress', { no_ready_check: true });
  });

  it('can create subscriber', function() {
    RedisPubSub.createSubscriber({redisURL: 'redisAddress'});

    var redis = require('redis');
    expect(redis.createClient).toHaveBeenCalledWith('redisAddress', { no_ready_check: true });
  });

  afterEach(function() {
    jasmine.restoreLibrary('redis', 'createClient');
  });
});
