import redis from 'redis';

function createPublisher({ redisURL, redisOptions = {} }): any {
  redisOptions.no_ready_check = true;
  return redis.createClient(redisURL, redisOptions);
}

function createSubscriber({ redisURL, redisOptions = {} }): any {
  redisOptions.no_ready_check = true;
  return redis.createClient(redisURL, redisOptions);
}

const RedisPubSub = {
  createPublisher,
  createSubscriber,
};

export { RedisPubSub };
