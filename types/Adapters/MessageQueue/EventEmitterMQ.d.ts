export var __esModule: boolean;
export namespace EventEmitterMQ {
    export { createPublisher };
    export { createSubscriber };
}
declare function createPublisher(): Publisher;
declare function createSubscriber(): Consumer;
declare class Publisher {
    constructor(emitter: any);
    emitter: any;
    publish(channel: any, message: any): void;
}
declare const Consumer_base: any;
declare class Consumer extends Consumer_base {
    [x: string]: any;
    constructor(emitter: any);
    emitter: any;
    subscribe(channel: any): void;
    unsubscribe(channel: any): void;
}
export {};
