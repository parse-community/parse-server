var Parse = require('parse/node').Parse;
// TODO: apn does not support the new HTTP/2 protocal. It is fine to use it in V1,
// but probably we will replace it in the future.
var apn = require('apn');

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
}

/**
 * Send apns request.
 * @param {Object} data The data we need to send, the format is the same with api request body
 * @param {Array} deviceTokens A array of device tokens
 * @returns {Object} A promise which is resolved immediately
 */
APNS.prototype.send = function(data, deviceTokens) {
  var coreData = data.data;
  var expirationTime = data['expiration_time'];
  var notification = generateNotification(coreData, expirationTime);
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
var generateNotification = function(coreData, expirationTime) {
  var notification = new apn.notification();
  var payload = {};
  for (key in coreData) {
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
        var isAvailable = coreData['content-available'] === 1;
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
