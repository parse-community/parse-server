'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _HTTPResponse = require('./HTTPResponse');

var _HTTPResponse2 = _interopRequireDefault(_HTTPResponse);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var encodeBody = function encodeBody(_ref) {
  var body = _ref.body;
  var _ref$headers = _ref.headers;
  var headers = _ref$headers === undefined ? {} : _ref$headers;

  if ((typeof body === 'undefined' ? 'undefined' : _typeof(body)) !== 'object') {
    return { body: body, headers: headers };
  }
  var contentTypeKeys = Object.keys(headers).filter(function (key) {
    return key.match(/content-type/i) != null;
  });

  if (contentTypeKeys.length == 0) {
    // no content type
    //  As per https://parse.com/docs/cloudcode/guide#cloud-code-advanced-sending-a-post-request the default encoding is supposedly x-www-form-urlencoded

    body = _querystring2.default.stringify(body);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else {
    /* istanbul ignore next */
    if (contentTypeKeys.length > 1) {
      _logger2.default.error('Parse.Cloud.httpRequest', 'multiple content-type headers are set.');
    }
    // There maybe many, we'll just take the 1st one
    var contentType = contentTypeKeys[0];
    if (headers[contentType].match(/application\/json/i)) {
      body = JSON.stringify(body);
    } else if (headers[contentType].match(/application\/x-www-form-urlencoded/i)) {
      body = _querystring2.default.stringify(body);
    }
  }
  return { body: body, headers: headers };
};

module.exports = function (options) {
  var promise = new _node2.default.Promise();
  var callbacks = {
    success: options.success,
    error: options.error
  };
  delete options.success;
  delete options.error;
  delete options.uri; // not supported
  options = Object.assign(options, encodeBody(options));
  // set follow redirects to false by default
  options.followRedirect = options.followRedirects == true;
  // support params options
  if (_typeof(options.params) === 'object') {
    options.qs = options.params;
  } else if (typeof options.params === 'string') {
    options.qs = _querystring2.default.parse(options.params);
  }
  // force the response as a buffer
  options.encoding = null;

  (0, _request2.default)(options, function (error, response, body) {
    if (error) {
      if (callbacks.error) {
        callbacks.error(error);
      }
      return promise.reject(error);
    }
    var httpResponse = new _HTTPResponse2.default(response, body);

    // Consider <200 && >= 400 as errors
    if (httpResponse.status < 200 || httpResponse.status >= 400) {
      if (callbacks.error) {
        callbacks.error(httpResponse);
      }
      return promise.reject(httpResponse);
    } else {
      if (callbacks.success) {
        callbacks.success(httpResponse);
      }
      return promise.resolve(httpResponse);
    }
  });
  return promise;
};

module.exports.encodeBody = encodeBody;