// Push Adapter
//
// Allows you to change the push notification mechanism.
//
// Adapter classes must implement the following functions:
// * initialize(pushConfig)
// * getPushSenders(parseConfig)
// * getValidPushTypes(parseConfig)
// * send(devices, installations)
//
// Default is ParsePushAdapter, which uses GCM for
// android push and APNS for ios push.

var ParsePushAdapter = require('./ParsePushAdapter');

var adapter = new ParsePushAdapter();

function setAdapter(pushAdapter) {
  adapter = pushAdapter;
}

function getAdapter() {
  return adapter;
}

module.exports = {
  getAdapter: getAdapter,
  setAdapter: setAdapter
};
