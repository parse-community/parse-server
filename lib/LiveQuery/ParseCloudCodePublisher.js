'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseCloudCodePublisher = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParsePubSub = require('./ParsePubSub');

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ParseCloudCodePublisher = function () {

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  function ParseCloudCodePublisher() {
    var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, ParseCloudCodePublisher);

    this.parsePublisher = _ParsePubSub.ParsePubSub.createPublisher(config);
  }

  _createClass(ParseCloudCodePublisher, [{
    key: 'onCloudCodeAfterSave',
    value: function onCloudCodeAfterSave(request) {
      this._onCloudCodeMessage(_node2.default.applicationId + 'afterSave', request);
    }
  }, {
    key: 'onCloudCodeAfterDelete',
    value: function onCloudCodeAfterDelete(request) {
      this._onCloudCodeMessage(_node2.default.applicationId + 'afterDelete', request);
    }

    // Request is the request object from cloud code functions. request.object is a ParseObject.

  }, {
    key: '_onCloudCodeMessage',
    value: function _onCloudCodeMessage(type, request) {
      _logger2.default.verbose('Raw request from cloud code current : %j | original : %j', request.object, request.original);
      // We need the full JSON which includes className
      var message = {
        currentParseObject: request.object._toFullJSON()
      };
      if (request.original) {
        message.originalParseObject = request.original._toFullJSON();
      }
      this.parsePublisher.publish(type, JSON.stringify(message));
    }
  }]);

  return ParseCloudCodePublisher;
}();

exports.ParseCloudCodePublisher = ParseCloudCodePublisher;