import { RedisPubSub } from './RedisPubSub';
import { EventEmitterPubSub } from './EventEmitterPubSub';

let ParsePubSub = {};

function useRedis(config: any): boolean {
  let redisURL = config.redisURL;
  return typeof redisURL !== 'undefined' && redisURL !== '';
}

ParsePubSub.createPublisher = function(config: any): any {
  if (useRedis(config)) {
    return RedisPubSub.createPublisher(config.redisURL);
  } else {
    return EventEmitterPubSub.createPublisher();
  }
}

ParsePubSub.createSubscriber = function(config: any): void {
  if (useRedis(config)) {
    return RedisPubSub.createSubscriber(config.redisURL);
  } else {
    return EventEmitterPubSub.createSubscriber();
  }
}

export {
  ParsePubSub
}
