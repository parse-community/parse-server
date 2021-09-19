import { Parse } from 'parse/node';
import * as events from '../events';

const ParseCloudEvent = {};

ParseCloudEvent._removeAllEvents = function () {
  events.resetEvents();
};

/**
 * Registers an event for specified event type.
 *
 * **Available on Cloud Code only.**
 *
 * ```
 * Parse.Cloud.Event.onAuthEvent(Parse.Cloud.Events.Login.loginStarted, (request) => {
 *   // code here
 * });
 * ```
 *
 * @method onAuthEvent
 * @name Parse.Cloud.onAuthEvent
 * @param {String} eventType Event type for registering the event.
 * @param {Function} handler Function to run when specified event happens.
 */
ParseCloudEvent.onAuthEvent = function (eventType, handler) {
  if (typeof eventType !== 'string' || typeof handler !== 'function') {
    return;
  }
  events.addEvent('_User', eventType, Parse.applicationId, handler);
};

module.exports = ParseCloudEvent;
