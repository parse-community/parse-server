"use strict";

const Parse = require('parse/node').Parse;
const http = require('http2');
const fs = require('fs');
const path = require('path');
const urlParse = require('url').parse;

const DEV_PUSH_SERVER = 'api.development.push.apple.com';
const PROD_PUSH_SERVER = 'api.push.apple.com';

const createRequestOptions = (opts, device, body) => {
  let domain = opts.production === true ? PROD_PUSH_SERVER : DEV_PUSH_SERVER;
  var options = urlParse(`https://${domain}/3/device/${device.deviceToken}`);
  options.method = 'POST';
  options.headers = {
    'apns-expiration': opts.expiration || 0,
    'apns-priority': opts.priority || 10,
    'apns-topic': opts.bundleId || opts['apns-topic'],
    'content-length': body.length
  };
  options.key = opts.key;
  options.cert = opts.cert;
  options.pfx = opts.pfx;
  options.passphrase = opts.passphrase;
  return Object.assign({}, options);
}

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
function APNS(options) {

  if (!Array.isArray(options)) {
    options = [options];
  }

  let agents = {};

  let optionsByBundle = options.reduce((memo, option) => {
    try {
      if (option.key && option.cert) {
        option.key = fs.readFileSync(option.key);
        option.cert = fs.readFileSync(option.cert);
      } else if (option.pfx) {
        option.pfx =  fs.readFileSync(option.pfx);
      } else {
        throw 'Either cert AND key, OR pfx is required'
      }
    } catch(e) {
      if (!process.env.NODE_ENV == 'test' || options.enforceCertificates) {
        throw e;
      }
    }
    option.agent = new http.Agent({
      key: option.key,
      cert: option.cert,
      pfx: option.pfx,
      passphrase: option.passphrase
    });
    memo[option.bundleId] = option;
    return memo;
  }, {});

  let getConfiguration = (bundleIdentifier) => {
    let configuration;
    if (bundleIdentifier) {
      configuration = optionsByBundle[bundleIdentifier];
      if (!configuration) {
        return;
      }
    }
    if (!configuration) {
      configuration = options[0];
    }
    return configuration;
  }

  /**
   * Send apns request.
   * @param {Object} data The data we need to send, the format is the same with api request body
   * @param {Array} devices A array of device tokens
   * @returns {Object} A promises that resolves with each notificaiton sending promise
   */
  let send = function(data, devices) {
    // Make sure devices are in an array
    if (!Array.isArray(devices)) {
      devices = [devices];
    }

    let coreData = data.data;
    let expirationTime = data['expiration_time'];
    let notification = generateNotification(coreData);
    let notificationString = JSON.stringify(notification);
    let buffer = new Buffer(notificationString);

    let promises = devices.map((device) => {
      return new Promise((resolve, reject) => {
        let configuration = getConfiguration(device.appIdentifier);
        if (!configuration) {
          return Promise.reject({
            status: -1,
            device: device,
            response: {"error": "No configuration set for that appIdentifier"},
            transmitted: false
          })
        }
        configuration = Object.assign({}, configuration, {expiration: expirationTime })
        let requestOptions = createRequestOptions(configuration, device, buffer);
        let req = configuration.agent.request(requestOptions, (response) => {
          response.setEncoding('utf8');
          var chunks = "";
          response.on('data', (chunk) => {
            chunks+=chunk;
          });
          response.on('end', () => {
            let body;
            try{
              body = JSON.parse(chunks);
            } catch (e) {
              body = {};
            }
            resolve({  status:      response.statusCode,
                    response:    body,
                    headers:     response.headers,
                    device:      device,
                    transmitted: response.statusCode == 200 });
          });
        });
        req.write(buffer);
        req.end();
      });
    });
    return Promise.all(promises);
  }

  return Object.freeze({
    send: send,
    getConfiguration: getConfiguration
  })
}

/**
 * Generate the apns notification from the data we get from api request.
 * @param {Object} coreData The data field under api request body
 * @returns {Object} A apns notification
 */
function generateNotification(coreData, expirationTime) {
  let payload = {};
  let notification = {};
  for (let key in coreData) {
    switch (key) {
      case 'alert':
        notification.alert = coreData.alert;
        break;
      case 'badge':
        notification.badge = coreData.badge;
        break;
      case 'sound':
        notification.sound = coreData.sound;
        break;
      case 'content-available':
        let isAvailable = coreData['content-available'] === 1;
        if (isAvailable) {
          notification['content-available'] = 1;
        }
        break;
      case 'category':
        notification.category = coreData.category;
        break;
      default:
        payload[key] = coreData[key];
        break;
    }
  }
  payload.aps = notification;
  return payload;
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  APNS.generateNotification = generateNotification;
}
module.exports = APNS;
