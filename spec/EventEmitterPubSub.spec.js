const EventEmitterPubSub = require('../lib/Adapters/PubSub/EventEmitterPubSub').EventEmitterPubSub;

describe('EventEmitterPubSub', function () {
  it('can publish and subscribe', function () {
    const publisher = EventEmitterPubSub.createPublisher();
    const subscriber = EventEmitterPubSub.createSubscriber();
    subscriber.subscribe('testChannel');
    // Register mock checked for subscriber
    let isChecked = false;
    subscriber.on('message', function (channel, message) {
      isChecked = true;
      expect(channel).toBe('testChannel');
      expect(message).toBe('testMessage');
    });

    publisher.publish('testChannel', 'testMessage');
    // Make sure the callback is checked
    expect(isChecked).toBe(true);
  });

  it('can unsubscribe', function () {
    const publisher = EventEmitterPubSub.createPublisher();
    const subscriber = EventEmitterPubSub.createSubscriber();
    subscriber.subscribe('testChannel');
    subscriber.unsubscribe('testChannel');
    // Register mock checked for subscriber
    let isCalled = false;
    subscriber.on('message', function () {
      isCalled = true;
    });

    publisher.publish('testChannel', 'testMessage');
    // Make sure the callback is not called
    expect(isCalled).toBe(false);
  });

  it('can unsubscribe not subscribing channel', function () {
    const subscriber = EventEmitterPubSub.createSubscriber();

    // Make sure subscriber does not throw exception
    subscriber.unsubscribe('testChannel');
  });
});
