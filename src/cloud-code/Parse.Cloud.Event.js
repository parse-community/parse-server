import { Parse } from 'parse/node';
import * as events from '../events';

const ParseCloudEvent = { ...events.EventTypes };

/**
 * Registers an event for specified event type.
 *
 * **Available on Cloud Code only.**
 *
 * ```
 * Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginStarted, (request) => {
 *   // code here
 * });
 * ```
 *
 * @method addLoginEvent
 * @name Parse.Cloud.Event.addLoginEvent
 * @param {String} arg1 Event type for registering the event.
 * @param {Function} handler Function to run when specified event happens.
 */
ParseCloudEvent.addLoginEvent = function (eventType, handler) {
  if (typeof eventType !== 'string' || typeof handler !== 'function') {
    return;
  }
  events.addEvent('_User', eventType, Parse.applicationId, handler);
};

module.exports = ParseCloudEvent;
