"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

/*eslint no-unused-vars: "off"*/
// Push Adapter
//
// Allows you to change the push notification mechanism.
//
// Adapter classes must implement the following functions:
// * getValidPushTypes()
// * send(devices, installations, pushStatus)
//
// Default is ParsePushAdapter, which uses GCM for
// android push and APNS for ios push.

class PushAdapter {
  send(body, installations, pushStatus) {}

  /**
   * Get an array of valid push types.
   * @returns {Array} An array of valid push types
   */
  getValidPushTypes() {
    return [];
  }
}

exports.PushAdapter = PushAdapter;
exports.default = PushAdapter;