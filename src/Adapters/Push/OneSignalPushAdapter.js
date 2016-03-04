"use strict";
// ParsePushAdapter is the default implementation of
// PushAdapter, it uses GCM for android push and APNS
// for ios push.

import { classifyInstallations } from './PushAdapterUtils';

const Parse = require('parse/node').Parse;
var deepcopy = require('deepcopy');
import PushAdapter from './PushAdapter';

export class OneSignalPushAdapter extends PushAdapter {
  
  constructor(pushConfig = {}) {
    super(pushConfig);
    this.https = require('https');
    
    this.validPushTypes = ['ios', 'android'];
    this.senderMap = {};
    this.OneSignalConfig = {};
    const { oneSignalAppId, oneSignalApiKey } = pushConfig;
    if (!oneSignalAppId || !oneSignalApiKey) {
      throw "Trying to initialize OneSignalPushAdapter without oneSignalAppId or oneSignalApiKey";
    }
    this.OneSignalConfig['appId'] = pushConfig['oneSignalAppId'];
    this.OneSignalConfig['apiKey'] = pushConfig['oneSignalApiKey'];
    
    this.senderMap['ios'] = this.sendToAPNS.bind(this);
    this.senderMap['android'] = this.sendToGCM.bind(this);
  }
  
  send(data, installations) {
    console.log("Sending notification to "+installations.length+" devices.")
    let deviceMap = classifyInstallations(installations, this.validPushTypes);

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
  
  static classifyInstallations(installations, validTypes) {
    return classifyInstallations(installations, validTypes)
  }
  
  getValidPushTypes() {
    return this.validPushTypes;
  }
  
  sendToAPNS(data,tokens) {

    data= deepcopy(data['data']);

    var post = {};
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
    let handleResponse = function(wasSuccessful) {
      if (!wasSuccessful) {
        return promise.reject("OneSignal Error");
      }

      if(offset >= tokenlength) {
        promise.resolve()
      } else {
        this.sendNext();
      }
    }.bind(this)

    this.sendNext = function() {
      post['include_ios_tokens'] = [];
      tokens.slice(offset,offset+chunk).forEach(function(i) {
        post['include_ios_tokens'].push(i['deviceToken'])
      })
      offset+=chunk;
      this.sendToOneSignal(post, handleResponse);
    }.bind(this)

    this.sendNext()

    return promise;
  }
  
  sendToGCM(data,tokens) {
    data= deepcopy(data['data']);

    var post = {};
    
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
    let handleResponse = function(wasSuccessful) {
      if (!wasSuccessful) {
        return promise.reject("OneSIgnal Error");
      }

      if(offset >= tokenlength) {
        promise.resolve()
      } else {
        this.sendNext();
      }
    }.bind(this);

    this.sendNext = function() {    
      post['include_android_reg_ids'] = [];
      tokens.slice(offset,offset+chunk).forEach(function(i) {
        post['include_android_reg_ids'].push(i['deviceToken'])
      })
      offset+=chunk;
      this.sendToOneSignal(post, handleResponse);
    }.bind(this)


    this.sendNext();
    return promise;
  }
  
  sendToOneSignal(data, cb) {
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
      if(res.statusCode < 299) {
        cb(true);
      } else {
        console.log('OneSignal Error');
        res.on('data', function(chunk) { 
          console.log(chunk.toString())
        });
        cb(false)
      }
    });
    request.on('error', function(e) {
      console.log("Error connecting to OneSignal")
      console.log(e);
      cb(false);
    });
    request.write(JSON.stringify(data))
    request.end();
  }
}


export default OneSignalPushAdapter;
module.exports = OneSignalPushAdapter;
