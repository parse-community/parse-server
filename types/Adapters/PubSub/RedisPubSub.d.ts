export var __esModule: boolean;
export namespace RedisPubSub {
    export { createPublisher };
    export { createSubscriber };
}
declare function createPublisher({ redisURL, redisOptions }: {
    redisURL: any;
    redisOptions?: {};
}): any;
declare function createSubscriber({ redisURL, redisOptions }: {
    redisURL: any;
    redisOptions?: {};
}): any;
export {};
