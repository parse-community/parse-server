"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AnalyticsAdapter = void 0;

/*eslint no-unused-vars: "off"*/

/**
 * @module Adapters
 */

/**
 * @interface AnalyticsAdapter
 */
class AnalyticsAdapter {
  /**
  @param {any} parameters: the analytics request body, analytics info will be in the dimensions property
  @param {Request} req: the original http request
   */
  appOpened(parameters, req) {
    return Promise.resolve({});
  }
  /**
  @param {String} eventName: the name of the custom eventName
  @param {any} parameters: the analytics request body, analytics info will be in the dimensions property
  @param {Request} req: the original http request
   */


  trackEvent(eventName, parameters, req) {
    return Promise.resolve({});
  }

}

exports.AnalyticsAdapter = AnalyticsAdapter;
var _default = AnalyticsAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BbmFseXRpY3MvQW5hbHl0aWNzQWRhcHRlci5qcyJdLCJuYW1lcyI6WyJBbmFseXRpY3NBZGFwdGVyIiwiYXBwT3BlbmVkIiwicGFyYW1ldGVycyIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwidHJhY2tFdmVudCIsImV2ZW50TmFtZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7O0FBR0E7OztBQUdPLE1BQU1BLGdCQUFOLENBQXVCO0FBQzVCOzs7O0FBSUFDLEVBQUFBLFNBQVMsQ0FBQ0MsVUFBRCxFQUFhQyxHQUFiLEVBQWtCO0FBQ3pCLFdBQU9DLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQixFQUFoQixDQUFQO0FBQ0Q7QUFFRDs7Ozs7OztBQUtBQyxFQUFBQSxVQUFVLENBQUNDLFNBQUQsRUFBWUwsVUFBWixFQUF3QkMsR0FBeEIsRUFBNkI7QUFDckMsV0FBT0MsT0FBTyxDQUFDQyxPQUFSLENBQWdCLEVBQWhCLENBQVA7QUFDRDs7QUFoQjJCOzs7ZUFtQmZMLGdCIiwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLyoqXG4gKiBAbW9kdWxlIEFkYXB0ZXJzXG4gKi9cbi8qKlxuICogQGludGVyZmFjZSBBbmFseXRpY3NBZGFwdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBBbmFseXRpY3NBZGFwdGVyIHtcbiAgLyoqXG4gIEBwYXJhbSB7YW55fSBwYXJhbWV0ZXJzOiB0aGUgYW5hbHl0aWNzIHJlcXVlc3QgYm9keSwgYW5hbHl0aWNzIGluZm8gd2lsbCBiZSBpbiB0aGUgZGltZW5zaW9ucyBwcm9wZXJ0eVxuICBAcGFyYW0ge1JlcXVlc3R9IHJlcTogdGhlIG9yaWdpbmFsIGh0dHAgcmVxdWVzdFxuICAgKi9cbiAgYXBwT3BlbmVkKHBhcmFtZXRlcnMsIHJlcSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gIEBwYXJhbSB7U3RyaW5nfSBldmVudE5hbWU6IHRoZSBuYW1lIG9mIHRoZSBjdXN0b20gZXZlbnROYW1lXG4gIEBwYXJhbSB7YW55fSBwYXJhbWV0ZXJzOiB0aGUgYW5hbHl0aWNzIHJlcXVlc3QgYm9keSwgYW5hbHl0aWNzIGluZm8gd2lsbCBiZSBpbiB0aGUgZGltZW5zaW9ucyBwcm9wZXJ0eVxuICBAcGFyYW0ge1JlcXVlc3R9IHJlcTogdGhlIG9yaWdpbmFsIGh0dHAgcmVxdWVzdFxuICAgKi9cbiAgdHJhY2tFdmVudChldmVudE5hbWUsIHBhcmFtZXRlcnMsIHJlcSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEFuYWx5dGljc0FkYXB0ZXI7XG4iXX0=