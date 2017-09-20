'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LiveQueryController = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParseCloudCodePublisher = require('../LiveQuery/ParseCloudCodePublisher');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var LiveQueryController = exports.LiveQueryController = function () {
  function LiveQueryController(config) {
    _classCallCheck(this, LiveQueryController);

    var classNames = void 0;
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

  _createClass(LiveQueryController, [{
    key: 'onAfterSave',
    value: function onAfterSave(className, currentObject, originalObject) {
      if (!this.hasLiveQuery(className)) {
        return;
      }
      var req = this._makePublisherRequest(currentObject, originalObject);
      this.liveQueryPublisher.onCloudCodeAfterSave(req);
    }
  }, {
    key: 'onAfterDelete',
    value: function onAfterDelete(className, currentObject, originalObject) {
      if (!this.hasLiveQuery(className)) {
        return;
      }
      var req = this._makePublisherRequest(currentObject, originalObject);
      this.liveQueryPublisher.onCloudCodeAfterDelete(req);
    }
  }, {
    key: 'hasLiveQuery',
    value: function hasLiveQuery(className) {
      return this.classNames.has(className);
    }
  }, {
    key: '_makePublisherRequest',
    value: function _makePublisherRequest(currentObject, originalObject) {
      var req = {
        object: currentObject
      };
      if (currentObject) {
        req.original = originalObject;
      }
      return req;
    }
  }]);

  return LiveQueryController;
}();

exports.default = LiveQueryController;