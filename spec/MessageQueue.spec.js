const ParseMessageQueue = require('../lib/ParseMessageQueue').ParseMessageQueue;
describe('message queue', () => {
  it('cannot create message quue with an invalid adapter', function () {
    expect(() =>
      ParseMessageQueue.createPublisher({
        messageQueueAdapter: {
          createPublisher: 'a',
          createSubscriber: () => {},
        },
      })
    ).toThrow('pubSubAdapter should have createPublisher()');

    expect(() =>
      ParseMessageQueue.createSubscriber({
        messageQueueAdapter: {
          createPublisher: () => {},
          createSubscriber: 'a',
        },
      })
    ).toThrow('messageQueueAdapter should have createSubscriber()');
  });
});
