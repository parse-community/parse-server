export var __esModule: boolean;
export default _default;
/**
 * @module Adapters
 */
/**
 * @interface PubSubAdapter
 */
export class PubSubAdapter {
    /**
     * @returns {PubSubAdapter.Publisher}
     */
    static createPublisher(): any;
    /**
     * @returns {PubSubAdapter.Subscriber}
     */
    static createSubscriber(): any;
}
declare var _default: typeof PubSubAdapter;
