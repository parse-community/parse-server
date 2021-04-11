export var __esModule: boolean;
export namespace EventEmitterPubSub {
    export { createPublisher };
    export { createSubscriber };
}
declare function createPublisher(): Publisher;
declare function createSubscriber(): Subscriber;
declare class Publisher {
    constructor(emitter: any);
    emitter: any;
    publish(channel: any, message: any): void;
}
declare const Subscriber_base: any;
declare class Subscriber extends Subscriber_base {
    [x: string]: any;
    constructor(emitter: any);
    emitter: any;
    subscriptions: Map<any, any>;
    subscribe(channel: any): void;
    unsubscribe(channel: any): void;
}
export {};
