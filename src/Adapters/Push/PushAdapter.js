// Push Adapter
//
// Allows you to change the push notification mechanism.
//
// Adapter classes must implement the following functions:
// * getValidPushTypes()
// * send(devices, installations)
//
// Default is ParsePushAdapter, which uses GCM for
// android push and APNS for ios push.

export class PushAdapter {
  send(devices, installations) { }

  /**
   * Get an array of valid push types.
   * @returns {Array} An array of valid push types
   */
  getValidPushTypes() {}
}

export default PushAdapter;
