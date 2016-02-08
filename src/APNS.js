"use strict";

const Parse = require('parse/node').Parse;
// TODO: apn does not support the new HTTP/2 protocal. It is fine to use it in V1,
// but probably we will replace it in the future.
const apn = require('apn');

/**
 * Create a new connection to the APN service.
 * @constructor
 * @param {Object} args Arguments to config APNS connection
 * @param {String} args.cert The filename of the connection certificate to load from disk, default is cert.pem
 * @param {String} args.key The filename of the connection key to load from disk, default is key.pem
 * @param {String} args.passphrase The passphrase for the connection key, if required
 * @param {Boolean} args.production Specifies which environment to connect to: Production (if true) or Sandbox
 */
function APNS(args) {
  this.sender = new apn.connection(args);

  this.sender.on('connected', function() {
      console.log('APNS Connected');
  });

  this.sender.on('transmissionError', function(errCode, notification, device) {
    console.error('APNS Notification caused error: ' + errCode + ' for device ', device, notification);
    // TODO: For error caseud by invalid deviceToken, we should mark those installations.
  });

  this.sender.on("timeout", function () {
      console.log("APNS Connection Timeout");
  });

  this.sender.on("disconnected", function() {
      console.log("APNS Disconnected");
  });

  this.sender.on("socketError", console.error);

  this.sender.on("transmitted", function(notification, device) {
    console.log("APNS Notification transmitted to:" + device.token.toString("hex"));
  });
}

/**
 * Send apns request.
 * @param {Object} data The data we need to send, the format is the same with api request body
 * @param {Array} devices A array of devices
 * @returns {Object} A promise which is resolved immediately
 */
APNS.prototype.send = function(data, devices) {
  let coreData = data.data;
  let expirationTime = data['expiration_time'];
  let notification = generateNotification(coreData, expirationTime);
  let deviceTokens = [];
  for (let device of devices) {
    deviceTokens.push(device.deviceToken);
  }
  this.sender.pushNotification(notification, deviceTokens);
  // TODO: pushNotification will push the notification to apn's queue.
  // We do not handle error in V1, we just relies apn to auto retry and send the
  // notifications.
  return Parse.Promise.as();
}

/**
 * Generate the apns notification from the data we get from api request.
 * @param {Object} coreData The data field under api request body
 * @returns {Object} A apns notification
 */
let generateNotification = function(coreData, expirationTime) {
  let notification = new apn.notification();
  let payload = {};
  for (let key in coreData) {
    switch (key) {
      case 'alert':
        notification.setAlertText(coreData.alert);
        break;
      case 'badge':
        notification.badge = coreData.badge;
        break;
      case 'sound':
        notification.sound = coreData.sound;
        break;
      case 'content-available':
        notification.setNewsstandAvailable(true);
        let isAvailable = coreData['content-available'] === 1;
        notification.setContentAvailable(isAvailable);
        break;
      case 'category':
        notification.category = coreData.category;
        break;
      default:
        payload[key] = coreData[key];
        break;
    }
  }
  notification.payload = payload;
  notification.expiry = expirationTime;
  return notification;
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  APNS.generateNotification = generateNotification;
}
module.exports = APNS;
