import { loadAdapter } from '../Adapters/AdapterLoader';
import {
  EventEmitterPubSub
} from '../Adapters/PubSub/EventEmitterPubSub';

import {
  RedisPubSub
} from '../Adapters/PubSub/RedisPubSub';

let ParsePubSub = {};

function useRedis(config: any): boolean {
  let redisURL = config.redisURL;
  return typeof redisURL !== 'undefined' && redisURL !== '';
}

ParsePubSub.createPublisher = function(config: any): any {
  if (useRedis(config)) {
    return RedisPubSub.createPublisher(config);
  } else {
    return EventEmitterPubSub.createPublisher();
  }
}

ParsePubSub.createSubscriber = function(config: any): void {
  if (useRedis(config)) {
    return RedisPubSub.createSubscriber(config);
  } else {
    return EventEmitterPubSub.createSubscriber();
  }
}

export {
  ParsePubSub
}
