/*eslint no-unused-vars: "off"*/
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
  static createPublisher() {}
  /**
   * @returns {PubSubAdapter.Subscriber}
   */
  static createSubscriber() {}
}

/**
 * @interface Publisher
 * @memberof PubSubAdapter
 */
interface Publisher {
  /**
   * @param {String} channel the channel in which to publish
   * @param {String} message the message to publish
   */
  publish(channel: string, message: string): void;
}

/**
 * @interface Subscriber
 * @memberof PubSubAdapter
 */
interface Subscriber {
  /**
   * called when a new subscription the channel is required
   * @param {String} channel the channel to subscribe
   */
  subscribe(channel: string): void;

  /**
   * called when the subscription from the channel should be stopped
   * @param {String} channel
   */
  unsubscribe(channel: string): void;
}

export default PubSubAdapter;
