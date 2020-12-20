import { loadAdapter } from '../Adapters/AdapterLoader';
import { EventEmitterPubSub } from '../Adapters/PubSub/EventEmitterPubSub';

import { RedisPubSub } from '../Adapters/PubSub/RedisPubSub';

const ParsePubSub = {};

function useRedis(config: any): boolean {
  const redisURL = config.redisURL;
  return typeof redisURL !== 'undefined' && redisURL !== '';
}

ParsePubSub.createPublisher = function (config: any): any {
  if (useRedis(config)) {
    return RedisPubSub.createPublisher(config);
  } else {
    const adapter = loadAdapter(config.pubSubAdapter, EventEmitterPubSub, config);
    if (typeof adapter.createPublisher !== 'function') {
      throw 'pubSubAdapter should have createPublisher()';
    }
    return adapter.createPublisher(config);
  }
};

ParsePubSub.createSubscriber = function (config: any): void {
  if (useRedis(config)) {
    return RedisPubSub.createSubscriber(config);
  } else {
    const adapter = loadAdapter(config.pubSubAdapter, EventEmitterPubSub, config);
    if (typeof adapter.createSubscriber !== 'function') {
      throw 'pubSubAdapter should have createSubscriber()';
    }
    return adapter.createSubscriber(config);
  }
};

export { ParsePubSub };
