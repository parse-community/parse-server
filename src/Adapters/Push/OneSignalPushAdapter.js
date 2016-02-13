"use strict";
// ParsePushAdapter is the default implementation of
// PushAdapter, it uses GCM for android push and APNS
// for ios push.

const Parse = require('parse/node').Parse;

function OneSignalPushAdapter(pushConfig) {
  this.https = require('https');

  this.validPushTypes = ['ios', 'gcm','android'];
  this.senderMap = {};

  pushConfig = pushConfig || {};
  this.OneSignalConfig = {};
  this.OneSignalConfig['appId'] = pushConfig['oneSignalAppId'];
  this.OneSignalConfig['apiKey'] = pushConfig['oneSignalApiKey'];
  
  this.senderMap['ios'] = this.sendToAPNS.bind(this);
  this.senderMap['gcm'] = this.sendToGCM.bind(this);
  this.senderMap['android'] = this.sendToGCM.bind(this);
}

/**
 * Get an array of valid push types.
 * @returns {Array} An array of valid push types
 */
OneSignalPushAdapter.prototype.getValidPushTypes = function() {
  return this.validPushTypes;
}

OneSignalPushAdapter.prototype.send = function(data, installations) {
  let deviceMap = classifyInstallation(installations, this.validPushTypes);

  let sendPromises = [];
  for (let pushType in deviceMap) {
    let sender = this.senderMap[pushType];
    if (!sender) {
      console.log('Can not find sender for push type %s, %j', pushType, data);
      continue;
    }
    let devices = deviceMap[pushType];

    if(devices.length > 0) {
      sendPromises.push(sender(data, devices));
    }
  }
  return Parse.Promise.when(sendPromises);
}

OneSignalPushAdapter.prototype.sendToAPNS = function(data,tokens) {

  let post = {};
  if(data['badge']) {
    if(data['badge'] == "Increment") {
      post['ios_badgeType'] = 'Increase';
      post['ios_badgeCount'] = 1;
    } else {
      post['ios_badgeType'] = 'SetTo';
      post['ios_badgeCount'] = data['badge'];
    }
    delete data['badge'];
  }
  if(data['alert']) {
    post['contents'] = {en: data['alert']};
    delete data['alert'];
  }
  if(data['sound']) {
    post['ios_sound'] = data['sound'];
    delete data['sound'];
  }
  if(data['content-available'] == 1) {
    post['content_available'] = true;
    delete data['content-available'];
  }
  post['data'] = data;

  let promise = new Parse.Promise();

  var chunk = 2000 // OneSignal can process 2000 devices at a time
  var tokenlength=tokens.length;
  var offset = 0
  // handle onesignal response. Start next batch if there's not an error.
  let handleResponse = function(err) {
    if (err) {
      return promise.reject(err, tokens.slice(i, tokens.length()));
    }

    if(offset => tokenlength) {
      promise.resolve()
    } else {
      this.sendNext();
    }
  }.bind(this)

  this.sendNext = function() {
    post['include_android_reg_ids'] = tokens.slice(offset,offset+chunk);
    offset+=chunk;
    this.sendToOneSignal(post, handleResponse);
  }.bind(this)

  this.sendNext()

  return promise;
}

OneSignalPushAdapter.prototype.sendToGCM = function(data,tokens) {
  let post = {};
  
  if(data['alert']) {
    post['contents'] = {en: data['alert']};
    delete data['alert'];
  }
  if(data['title']) {
    post['title'] = {en: data['title']};
    delete data['title']; 
  }
  if(data['uri']) {
    post['url'] = data['uri'];
  }

  post['data'] = data;

  let promise = new Parse.Promise();

  var chunk = 2000 // OneSignal can process 2000 devices at a time
  var tokenlength=tokens.length;
  var offset = 0
  // handle onesignal response. Start next batch if there's not an error.
  let handleResponse = function(err) {
    if (err) {
      return promise.reject(err, tokens.slice(i, tokens.length()));
    }

    if(offset => tokenlength) {
      promise.resolve()
    } else {
      this.sendNext();
    }
  }.bind(this);

  this.sendNext = function() {
    post['include_android_reg_ids'] = tokens.slice(offset,offset+chunk);;
    offset+=chunk;
    this.sendToOneSignal(post, handleResponse);
  }.bind(this);

  this.sendNext();
  return promise;
}


OneSignalPushAdapter.prototype.sendToOneSignal = function(data, cb) {
  let headers = {
    "Content-Type": "application/json",
    "Authorization": "Basic "+this.OneSignalConfig['apiKey']
  };
  let options = {
    host: "onesignal.com",
    port: 443,
    path: "/api/v1/notifications",
    method: "POST",
    headers: headers
  };
  data['app_id'] = this.OneSignalConfig['appId'];

  let request = this.https.request(options, function(res) {
    cb(null);
  });
  request.on('error', function(e) {
    cb(e);
  });
  console.log(data);
  request.write(JSON.stringify(data))
  request.end();
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
        deviceToken: installation.deviceToken
      });
    } else {
      console.log('Unknown push type from installation %j', installation);
    }
  }
  return deviceMap;
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  OneSignalPushAdapter.classifyInstallation = classifyInstallation;
}
module.exports = OneSignalPushAdapter;
