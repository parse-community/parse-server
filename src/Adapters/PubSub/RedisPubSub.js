import redis from 'redis';

function createPublisher({redisURL}): any {
  return redis.createClient(redisURL, { no_ready_check: true });
}

function createSubscriber({redisURL}): any {
  return redis.createClient(redisURL, { no_ready_check: true });
}

const RedisPubSub = {
  createPublisher,
  createSubscriber
}

export {
  RedisPubSub
}
