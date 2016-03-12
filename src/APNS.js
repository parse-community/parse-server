"use strict";

const Parse = require('parse/node').Parse;
// TODO: apn does not support the new HTTP/2 protocal. It is fine to use it in V1,
// but probably we will replace it in the future.
const apn = require('apn');

/**
 * Create a new connection to the APN service.
 * @constructor
 * @param {Object|Array} args An argument or a list of arguments to config APNS connection
 * @param {String} args.cert The filename of the connection certificate to load from disk
 * @param {String} args.key The filename of the connection key to load from disk
 * @param {String} args.pfx The filename for private key, certificate and CA certs in PFX or PKCS12 format, it will overwrite cert and key
 * @param {String} args.passphrase The passphrase for the connection key, if required
 * @param {String} args.bundleId The bundleId for cert
 * @param {Boolean} args.production Specifies which environment to connect to: Production (if true) or Sandbox
 */
function APNS(args) {
  // Since for ios, there maybe multiple cert/key pairs,
  // typePushConfig can be an array.
  let apnsArgsList = [];
  if (Array.isArray(args)) {
    apnsArgsList = apnsArgsList.concat(args);
  } else if (typeof args === 'object') {
    apnsArgsList.push(args);
  } else {
    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                          'APNS Configuration is invalid');
  }

  this.conns = [];
  for (let apnsArgs of apnsArgsList) {
    let conn = new apn.Connection(apnsArgs);
    if (!apnsArgs.bundleId) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'BundleId is mssing for %j', apnsArgs);
    }
    conn.bundleId = apnsArgs.bundleId;
    // Set the priority of the conns, prod cert has higher priority
    if (apnsArgs.production) {
      conn.priority = 0;
    } else {
      conn.priority = 1;
    }

    // Set apns client callbacks
    conn.on('connected', () => {
      console.log('APNS Connection %d Connected', conn.index);
    });

    conn.on('transmissionError', (errCode, notification, apnDevice) => {
      handleTransmissionError(this.conns, errCode, notification, apnDevice);
    });

    conn.on('timeout', () => {
      console.log('APNS Connection %d Timeout', conn.index);
    });

    conn.on('disconnected', () => {
      console.log('APNS Connection %d Disconnected', conn.index);
    });

    conn.on('socketError', () => {
      console.log('APNS Connection %d Socket Error', conn.index);
    });

    conn.on('transmitted', function(notification, device) {
      if (device.callback) {
        device.callback(null, {
          notification: notification,
          device: device
        });
      }
      console.log('APNS Connection %d Notification transmitted to %s', conn.index, device.token.toString('hex'));
    });

    this.conns.push(conn);
  }
  // Sort the conn based on priority ascending, high pri first
  this.conns.sort((s1, s2) => {
    return s1.priority - s2.priority;
  });
  // Set index of conns
  for (let index = 0; index < this.conns.length; index++) {
    this.conns[index].index = index;
  }
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

  let promises = devices.map((device) => {
    let qualifiedConnIndexs = chooseConns(this.conns, device);
    // We can not find a valid conn, just ignore this device
    if (qualifiedConnIndexs.length == 0) {
      return Promise.resolve({
        err: 'No connection available'
      });
    }
    let conn = this.conns[qualifiedConnIndexs[0]];
    let apnDevice = new apn.Device(device.deviceToken);
    apnDevice.connIndex = qualifiedConnIndexs[0];
    // Add additional appIdentifier info to apn device instance
    if (device.appIdentifier) {
      apnDevice.appIdentifier = device.appIdentifier;
    }
    return new Promise((resolve, reject) => {
      apnDevice.callback = (err, res) => {
        resolve({
          error: err,
          response: res,
          payload: notification,
          deviceType: 'ios'
        });
      }
      conn.pushNotification(notification, apnDevice);
    });
  });
  return Parse.Promise.when(promises);
}

function handleTransmissionError(conns, errCode, notification, apnDevice) {
  console.error('APNS Notification caused error: ' + errCode + ' for device ', apnDevice, notification);
  // This means the error notification is not in the cache anymore or the recepient is missing,
  // we just ignore this case
  if (!notification || !apnDevice) {
    return
  }

  // If currentConn can not send the push notification, we try to use the next available conn.
  // Since conns is sorted by priority, the next conn means the next low pri conn.
  // If there is no conn available, we give up on sending the notification to that device.
  let qualifiedConnIndexs = chooseConns(conns, apnDevice);
  let currentConnIndex = apnDevice.connIndex;

  let newConnIndex = -1;
  // Find the next element of currentConnIndex in qualifiedConnIndexs
  for (let index = 0; index < qualifiedConnIndexs.length - 1; index++) {
    if (qualifiedConnIndexs[index] === currentConnIndex) {
      newConnIndex = qualifiedConnIndexs[index + 1];
      break;
    }
  }
  // There is no more available conns, we give up in this case
  if (newConnIndex < 0 || newConnIndex >= conns.length) {
    if (apnDevice.callback) {
      apnDevice.callback({
        error: `APNS can not find vaild connection for ${apnDevice.token}`,
        code: errCode
      });
    }
    return;
  }

  let newConn = conns[newConnIndex];
  // Update device conn info
  apnDevice.connIndex = newConnIndex;
  // Use the new conn to send the notification
  newConn.pushNotification(notification, apnDevice);
}

function chooseConns(conns, device) {
  // If device does not have appIdentifier, all conns maybe proper connections.
  // Otherwise we try to match the appIdentifier with bundleId
  let qualifiedConns = [];
  for (let index = 0; index < conns.length; index++) {
    let conn = conns[index];
    // If the device we need to send to does not have
    // appIdentifier, any conn could be a qualified connection
    if (!device.appIdentifier || device.appIdentifier === '') {
      qualifiedConns.push(index);
      continue;
    }
    if (device.appIdentifier === conn.bundleId) {
      qualifiedConns.push(index);
    }
  }
  return qualifiedConns;
}

/**
 * Generate the apns notification from the data we get from api request.
 * @param {Object} coreData The data field under api request body
 * @returns {Object} A apns notification
 */
function generateNotification(coreData, expirationTime) {
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
  APNS.chooseConns = chooseConns;
  APNS.handleTransmissionError = handleTransmissionError;
}
module.exports = APNS;
