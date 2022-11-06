import { createClient } from 'redis';

function createPublisher({ redisURL, redisOptions = {} }): any {
  redisOptions.no_ready_check = true;
  return createClient(redisURL, redisOptions);
}

function createSubscriber({ redisURL, redisOptions = {} }): any {
  redisOptions.no_ready_check = true;
  return createClient(redisURL, redisOptions);
}

const RedisPubSub = {
  createPublisher,
  createSubscriber,
};

export { RedisPubSub };
