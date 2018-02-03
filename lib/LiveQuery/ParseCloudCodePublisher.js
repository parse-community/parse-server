'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseCloudCodePublisher = undefined;

var _ParsePubSub = require('./ParsePubSub');

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseCloudCodePublisher {

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config = {}) {
    this.parsePublisher = _ParsePubSub.ParsePubSub.createPublisher(config);
  }

  onCloudCodeAfterSave(request) {
    this._onCloudCodeMessage(_node2.default.applicationId + 'afterSave', request);
  }

  onCloudCodeAfterDelete(request) {
    this._onCloudCodeMessage(_node2.default.applicationId + 'afterDelete', request);
  }

  // Request is the request object from cloud code functions. request.object is a ParseObject.
  _onCloudCodeMessage(type, request) {
    _logger2.default.verbose('Raw request from cloud code current : %j | original : %j', request.object, request.original);
    // We need the full JSON which includes className
    const message = {
      currentParseObject: request.object._toFullJSON()
    };
    if (request.original) {
      message.originalParseObject = request.original._toFullJSON();
    }
    this.parsePublisher.publish(type, JSON.stringify(message));
  }
}

exports.ParseCloudCodePublisher = ParseCloudCodePublisher;