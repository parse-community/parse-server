"use strict";
// ParsePushAdapter is the default implementation of
// PushAdapter, it uses GCM for android push and APNS
// for ios push.

const Parse = require('parse/node').Parse;
const GCM = require('../../GCM');
const APNS = require('../../APNS');

function ParsePushAdapter(pushConfig) {
  this.validPushTypes = ['ios', 'android'];
  this.senderMap = {};

  pushConfig = pushConfig || {};
  let pushTypes = Object.keys(pushConfig);
  for (let pushType of pushTypes) {
    if (this.validPushTypes.indexOf(pushType) < 0) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Push to ' + pushTypes + ' is not supported');
    }
    switch (pushType) {
      case 'ios':
        this.senderMap[pushType] = new APNS(pushConfig[pushType]);
        break;
      case 'android':
        this.senderMap[pushType] = new GCM(pushConfig[pushType]);
        break;
    }
  }
}

/**
 * Get an array of valid push types.
 * @returns {Array} An array of valid push types
 */
ParsePushAdapter.prototype.getValidPushTypes = function() {
  return this.validPushTypes;
}

ParsePushAdapter.prototype.send = function(data, installations) {
  let deviceMap = classifyInstallation(installations, this.validPushTypes);
  let sendPromises = [];
  for (let pushType in deviceMap) {
    let sender = this.senderMap[pushType];
    if (!sender) {
      console.log('Can not find sender for push type %s, %j', pushType, data);
      continue;
    }
    let devices = deviceMap[pushType];
    sendPromises.push(sender.send(data, devices));
  }
  return Parse.Promise.when(sendPromises);
}

/**g
 * Classify the device token of installations based on its device type.
 * @param {Object} installations An array of installations
 * @param {Array} validPushTypes An array of valid push types(string)
 * @returns {Object} A map whose key is device type and value is an array of device
 */
function classifyInstallation(installations, validPushTypes) {
  // Init deviceTokenMap, create a empty array for each valid pushType
  let deviceMap = {};
  for (let validPushType of validPushTypes) {
    deviceMap[validPushType] = [];
  }
  for (let installation of installations) {
    // No deviceToken, ignore
    if (!installation.deviceToken) {
      continue;
    }
    let pushType = installation.deviceType;
    if (deviceMap[pushType]) {
      deviceMap[pushType].push({
        deviceToken: installation.deviceToken,
        appIdentifier: installation.appIdentifier
      });
    } else {
      console.log('Unknown push type from installation %j', installation);
    }
  }
  return deviceMap;
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  ParsePushAdapter.classifyInstallation = classifyInstallation;
}
module.exports = ParsePushAdapter;
