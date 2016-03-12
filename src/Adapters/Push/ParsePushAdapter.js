"use strict";
// ParsePushAdapter is the default implementation of
// PushAdapter, it uses GCM for android push and APNS
// for ios push.

const Parse = require('parse/node').Parse;
const GCM = require('../../GCM');
const APNS = require('../../APNS');
import PushAdapter from './PushAdapter';
import { classifyInstallations } from './PushAdapterUtils';

export class ParsePushAdapter extends PushAdapter {
  constructor(pushConfig = {}) {
    super(pushConfig);
    this.validPushTypes = ['ios', 'android'];
    this.senderMap = {};
    // used in PushController for Dashboard Features
    this.feature = {
      immediatePush: true
    };
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

  getValidPushTypes() {
    return this.validPushTypes;
  }

  static classifyInstallations(installations, validTypes) {
    return classifyInstallations(installations, validTypes)
  }

  send(data, installations) {
    let deviceMap = classifyInstallations(installations, this.validPushTypes);
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
}

export default ParsePushAdapter;
module.exports = ParsePushAdapter;
