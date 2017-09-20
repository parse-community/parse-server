var EventEmitterPubSub = require('../src/Adapters/PubSub/EventEmitterPubSub').EventEmitterPubSub;

describe('EventEmitterPubSub', function() {
  it('can publish and subscribe', function() {
    var publisher = EventEmitterPubSub.createPublisher();
    var subscriber = EventEmitterPubSub.createSubscriber();
    subscriber.subscribe('testChannel');
    // Register mock checked for subscriber
    var isChecked = false;
    subscriber.on('message', function(channel, message) {
      isChecked = true;
      expect(channel).toBe('testChannel');
      expect(message).toBe('testMessage');
    });

    publisher.publish('testChannel', 'testMessage');
    // Make sure the callback is checked
    expect(isChecked).toBe(true);
  });

  it('can unsubscribe', function() {
    var publisher = EventEmitterPubSub.createPublisher();
    var subscriber = EventEmitterPubSub.createSubscriber();
    subscriber.subscribe('testChannel');
    subscriber.unsubscribe('testChannel');
    // Register mock checked for subscriber
    var isCalled = false;
    subscriber.on('message', function() {
      isCalled = true;
    });

    publisher.publish('testChannel', 'testMessage');
    // Make sure the callback is not called
    expect(isCalled).toBe(false);
  });

  it('can unsubscribe not subscribing channel', function() {
    var subscriber = EventEmitterPubSub.createSubscriber();

    // Make sure subscriber does not throw exception
    subscriber.unsubscribe('testChannel');
  });
});
