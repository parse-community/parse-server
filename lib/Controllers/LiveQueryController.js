'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LiveQueryController = undefined;

var _ParseCloudCodePublisher = require('../LiveQuery/ParseCloudCodePublisher');

var _Options = require('../Options');

class LiveQueryController {

  constructor(config) {
    // If config is empty, we just assume no classs needs to be registered as LiveQuery
    if (!config || !config.classNames) {
      this.classNames = new Set();
    } else if (config.classNames instanceof Array) {
      this.classNames = new Set(config.classNames);
    } else {
      throw 'liveQuery.classes should be an array of string';
    }
    this.liveQueryPublisher = new _ParseCloudCodePublisher.ParseCloudCodePublisher(config);
  }

  onAfterSave(className, currentObject, originalObject) {
    if (!this.hasLiveQuery(className)) {
      return;
    }
    const req = this._makePublisherRequest(currentObject, originalObject);
    this.liveQueryPublisher.onCloudCodeAfterSave(req);
  }

  onAfterDelete(className, currentObject, originalObject) {
    if (!this.hasLiveQuery(className)) {
      return;
    }
    const req = this._makePublisherRequest(currentObject, originalObject);
    this.liveQueryPublisher.onCloudCodeAfterDelete(req);
  }

  hasLiveQuery(className) {
    return this.classNames.has(className);
  }

  _makePublisherRequest(currentObject, originalObject) {
    const req = {
      object: currentObject
    };
    if (currentObject) {
      req.original = originalObject;
    }
    return req;
  }
}

exports.LiveQueryController = LiveQueryController;
exports.default = LiveQueryController;