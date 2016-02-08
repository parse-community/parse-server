"use strict";
// ParsePushAdapter is the default implementation of
// PushAdapter, it uses GCM for android push and APNS
// for ios push.

const Parse = require('parse/node').Parse;
const GCM = require('../../GCM');
const APNS = require('../../APNS');

function ParsePushAdapter() {
 this.validPushTypes = ['ios', 'android'];
 this.senders = {};
}

/**
 * Register push senders
 * @param {Object} pushConfig The push configuration which is given when parse server is initialized
 */
ParsePushAdapter.prototype.initialize = function(pushConfig) {
  // Initialize senders
  for (let validPushType of this.validPushTypes) {
    this.senders[validPushType] = [];
  }

  pushConfig = pushConfig || {};
  let pushTypes = Object.keys(pushConfig);
  for (let pushType of pushTypes) {
    if (this.validPushTypes.indexOf(pushType) < 0) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Push to ' + pushTypes + ' is not supported');
    }

    let typePushConfig = pushConfig[pushType];
    let senderArgs = [];
    // Since for ios, there maybe multiple cert/key pairs,
    // typePushConfig can be an array.
    if (Array.isArray(typePushConfig)) {
      senderArgs = senderArgs.concat(typePushConfig);
    } else if (typeof typePushConfig === 'object') {
      senderArgs.push(typePushConfig);
    } else {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Push Configuration is invalid');
    }
    for (let senderArg of senderArgs) {
      let sender;
      switch (pushType) {
        case 'ios':
          sender = new APNS(senderArg);
          break;
        case 'android':
          sender = new GCM(senderArg);
          break;
      }
      this.senders[pushType].push(sender);
    }
  }
}

/**
 * Get an array of push senders based on the push type.
 * @param {String} The push type
 * @returns {Array|Undefined} An array of push senders
 */
ParsePushAdapter.prototype.getPushSenders = function(pushType) {
  if (!this.senders[pushType]) {
    console.log('No push sender for push type %s', pushType);
    return [];
  }
  return this.senders[pushType];
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
    let senders = this.getPushSenders(pushType);
    // Since ios have dev/prod cert, a push type may have multiple senders
    for (let sender of senders) {
      let devices = deviceMap[pushType];
      if (!sender || devices.length == 0) {
        continue;
      }
      // For android, we can only have 1000 recepients per send
      let chunkDevices = sliceDevices(pushType, devices, GCM.GCMRegistrationTokensMax);
      for (let chunkDevice of chunkDevices) {
        sendPromises.push(sender.send(data, chunkDevice));
      }
    }
  }
  return Parse.Promise.when(sendPromises);
}

/**
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
        deviceToken: installation.deviceToken
      });
    } else {
      console.log('Unknown push type from installation %j', installation);
    }
  }
  return deviceMap;
}

/**
 * Slice a list of devices to several list of devices with fixed chunk size.
 * @param {String} pushType The push type of the given device tokens
 * @param {Array} devices An array of devices
 * @param {Number} chunkSize The size of the a chunk
 * @returns {Array} An array which contaisn several arries of devices with fixed chunk size
 */
function sliceDevices(pushType, devices, chunkSize) {
  if (pushType !== 'android') {
    return [devices];
  }
  let chunkDevices = [];
  while (devices.length > 0) {
    chunkDevices.push(devices.splice(0, chunkSize));
  }
  return chunkDevices;
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  ParsePushAdapter.classifyInstallation = classifyInstallation;
  ParsePushAdapter.sliceDevices = sliceDevices;
}
module.exports = ParsePushAdapter;
