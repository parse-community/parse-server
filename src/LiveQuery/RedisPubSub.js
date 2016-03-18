import redis from 'redis';

function createPublisher(redisURL: string): any {
  return redis.createClient(redisURL, { no_ready_check: true });
}

function createSubscriber(redisURL: string): any {
  return redis.createClient(redisURL, { no_ready_check: true });
}

let RedisPubSub = {
  createPublisher,
  createSubscriber
}

export {
  RedisPubSub
}
