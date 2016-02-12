"use strict";

const Parse = require('parse/node').Parse;
const gcm = require('node-gcm');
const cryptoUtils = require('./cryptoUtils');

const GCMTimeToLiveMax = 4 * 7 * 24 * 60 * 60; // GCM allows a max of 4 weeks
const GCMRegistrationTokensMax = 1000;

function GCM(args) {
  if (typeof args !== 'object' || !args.apiKey) {
    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                          'GCM Configuration is invalid');
  }
  this.sender = new gcm.Sender(args.apiKey);
}

/**
 * Send gcm request.
 * @param {Object} data The data we need to send, the format is the same with api request body
 * @param {Array} devices A array of devices
 * @returns {Object} A promise which is resolved after we get results from gcm
 */
GCM.prototype.send = function(data, devices) {
  let pushId = cryptoUtils.newObjectId();
  let timeStamp = Date.now();
  let expirationTime;
  // We handle the expiration_time convertion in push.js, so expiration_time is a valid date
  // in Unix epoch time in milliseconds here
  if (data['expiration_time']) {
    expirationTime = data['expiration_time'];
  }
  // Generate gcm payload
  let gcmPayload = generateGCMPayload(data.data, pushId, timeStamp, expirationTime);
  // Make and send gcm request
  let message = new gcm.Message(gcmPayload);

  let sendPromises = [];
  // For android, we can only have 1000 recepients per send, so we need to slice devices to
  // chunk if necessary
  let chunkDevices = sliceDevices(devices, GCMRegistrationTokensMax);
  for (let chunkDevice of chunkDevices) {
    let sendPromise = new Parse.Promise();
    let registrationTokens = []
    for (let device of chunkDevice) {
      registrationTokens.push(device.deviceToken);
    }
    this.sender.send(message, { registrationTokens: registrationTokens }, 5, (error, response) => {
      // TODO: Use the response from gcm to generate and save push report
      // TODO: If gcm returns some deviceTokens are invalid, set tombstone for the installation
      console.log('GCM request and response %j', {
        request: message,
        response: response
      });
      sendPromise.resolve();
    });
    sendPromises.push(sendPromise);
  }

  return Parse.Promise.when(sendPromises);
}

/**
 * Generate the gcm payload from the data we get from api request.
 * @param {Object} coreData The data field under api request body
 * @param {String} pushId A random string
 * @param {Number} timeStamp A number whose format is the Unix Epoch
 * @param {Number|undefined} expirationTime A number whose format is the Unix Epoch or undefined
 * @returns {Object} A promise which is resolved after we get results from gcm
 */
function generateGCMPayload(coreData, pushId, timeStamp, expirationTime) {
  let payloadData =  {
    'time': new Date(timeStamp).toISOString(),
    'push_id': pushId,
    'data': JSON.stringify(coreData)
  }
  let payload = {
    priority: 'normal',
    data: payloadData
  };
  if (expirationTime) {
   // The timeStamp and expiration is in milliseconds but gcm requires second
    let timeToLive = Math.floor((expirationTime - timeStamp) / 1000);
    if (timeToLive < 0) {
      timeToLive = 0;
    }
    if (timeToLive >= GCMTimeToLiveMax) {
      timeToLive = GCMTimeToLiveMax;
    }
    payload.timeToLive = timeToLive;
  }
  return payload;
}

/**
 * Slice a list of devices to several list of devices with fixed chunk size.
 * @param {Array} devices An array of devices
 * @param {Number} chunkSize The size of the a chunk
 * @returns {Array} An array which contaisn several arries of devices with fixed chunk size
 */
function sliceDevices(devices, chunkSize) {
  let chunkDevices = [];
  while (devices.length > 0) {
    chunkDevices.push(devices.splice(0, chunkSize));
  }
  return chunkDevices;
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  GCM.generateGCMPayload = generateGCMPayload;
  GCM.sliceDevices = sliceDevices;
}
module.exports = GCM;
