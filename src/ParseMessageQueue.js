import { loadAdapter } from './Adapters/AdapterLoader';
import { EventEmitterMQ } from './Adapters/MessageQueue/EventEmitterMQ';

const ParseMessageQueue = {};

ParseMessageQueue.createPublisher = function (config: any): any {
  const adapter = loadAdapter(config.messageQueueAdapter, EventEmitterMQ, config);
  if (typeof adapter.createPublisher !== 'function') {
    throw 'pubSubAdapter should have createPublisher()';
  }
  return adapter.createPublisher(config);
};

ParseMessageQueue.createSubscriber = function (config: any): void {
  const adapter = loadAdapter(config.messageQueueAdapter, EventEmitterMQ, config);
  if (typeof adapter.createSubscriber !== 'function') {
    throw 'messageQueueAdapter should have createSubscriber()';
  }
  return adapter.createSubscriber(config);
};

export { ParseMessageQueue };
