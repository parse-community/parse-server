"use strict";

import PushAdapter from './PushAdapter';
import {Parse} from 'parse/node';

const defaultMaxTokensPerRequest = 1000;

export class PushwooshPushAdapter extends PushAdapter {
  constructor(pushConfig = {}) {
    super(pushConfig);
    this.https = require('https');
    this.requestOptions = {
      host: 'cp.pushwoosh.com',
      port: 443,
      path: '/json/1.3/createMessage',
      method: 'POST'
    };

    this.validPushTypes = ['ios', 'android'];

    const {applicationCode, apiAccessKey, maxTokensPerRequest = defaultMaxTokensPerRequest} = pushConfig;
    if (!applicationCode || !apiAccessKey) {
      throw "Trying to initialize PushwooshPushAdapter without applicationCode or apiAccessKey";
    }
    this.maxTokensPerRequest = maxTokensPerRequest;
    this.pushwooshConfig = {
      application: applicationCode,
      auth: apiAccessKey
    };
  }

  getValidPushTypes() {
    return this.validPushTypes;
  }

  getValidTokens(installations) {
    return installations
      .filter(installation => ~this.validPushTypes.indexOf(installation.deviceType) && installation.deviceToken)
      .map(installation => installation.deviceToken);
  }

  send(data, installations) {
    const tokens = this.getValidTokens(installations);
    const chunks = [];
    let i = 0;

    while (i < tokens.length) {
      chunks.push(tokens.slice(i, i += this.maxTokensPerRequest));
    }

    return chunks.reduce(
      (pr, chunk)=> pr.then(() => this.sendRequest(this.makeNotification(data.data, chunk))),
      Parse.Promise.resolve()
    );
  }

  makeNotification(data, devices) {
    const notification = {
      send_date: 'now',
      devices: devices
    };
    const {badge, alert, sound, title, uri, 'content-available': contentAvailable, ...customData} = data;

    if (typeof badge !== 'undefined' && badge !== null) {
      if (badge === 'Increment') {
        notification['ios_badges'] = '+1';
        notification['android_badges'] = '+1';
      } else {
        notification['ios_badges'] = badge;
        notification['android_badges'] = badge;
      }
    }
    if (alert) {
      notification['content'] = {en: alert};
    }
    if (sound) {
      notification['ios_sound'] = sound;
    }
    if (title) {
      notification['android_header'] = title;
    }
    if (uri) {
      notification['link'] = uri;
    }
    if (contentAvailable == 1) {
      notification['ios_root_params'] = {
        aps: {
          'content-available': '1'
        }
      };
    }
    if (Object.keys(customData).length > 0) {
      notification['data'] = customData;
    }

    return notification
  }

  sendRequest(notification) {
    const pushwooshRequest = {
      request: {
        ...this.pushwooshConfig,
        notifications: [notification]
      }
    };

    const promise = new Parse.Promise();

    const request = this.https.request(this.requestOptions, function(res) {
      if(res.statusCode < 201) {
        promise.resolve();
      } else {
        console.log('Pushwoosh Error');
        res.on('data', function(dataChunk) {
          console.log(dataChunk.toString());
        });
        promise.reject('Pushwoosh Error');
      }
    });
    request.on('error', function(e) {
      console.log("Error connecting to Pushwoosh");
      console.log(e);
      promise.reject("Error connecting to Pushwoosh");
    });
    request.end(JSON.stringify(pushwooshRequest));

    return promise;
  }
}

export default PushwooshPushAdapter;
module.exports = PushwooshPushAdapter;
