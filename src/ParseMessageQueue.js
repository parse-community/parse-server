import { loadAdapter } from './Adapters/AdapterLoader';
import {
  EventEmitterMQ
} from './Adapters/MessageQueue/EventEmitterMQ';

let ParseMessageQueue = {};

ParseMessageQueue.createPublisher = function(config: any): any {
  let adapter = loadAdapter(config.messageQueueAdapter, EventEmitterMQ, config);
  if (typeof adapter.createPublisher !== 'function') {
    throw 'pubSubAdapter should have createPublisher()';
  }
  return adapter.createPublisher(config);
}

ParseMessageQueue.createSubscriber = function(config: any): void {
  let adapter = loadAdapter(config.messageQueueAdapter, EventEmitterMQ, config)
  if (typeof adapter.createSubscriber !== 'function') {
    throw 'messageQueueAdapter should have createSubscriber()';
  }
  return adapter.createSubscriber(config);
}

export {
  ParseMessageQueue
}
