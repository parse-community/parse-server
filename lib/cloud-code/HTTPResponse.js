'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var HTTPResponse = function HTTPResponse(response, body) {
  var _this = this;

  _classCallCheck(this, HTTPResponse);

  var _text = void 0,
      _data = void 0;
  this.status = response.statusCode;
  this.headers = response.headers || {};
  this.cookies = this.headers["set-cookie"];

  if (typeof body == 'string') {
    _text = body;
  } else if (Buffer.isBuffer(body)) {
    this.buffer = body;
  } else if ((typeof body === 'undefined' ? 'undefined' : _typeof(body)) == 'object') {
    _data = body;
  }

  var getText = function getText() {
    if (!_text && _this.buffer) {
      _text = _this.buffer.toString('utf-8');
    } else if (!_text && _data) {
      _text = JSON.stringify(_data);
    }
    return _text;
  };

  var getData = function getData() {
    if (!_data) {
      try {
        _data = JSON.parse(getText());
      } catch (e) {}
    }
    return _data;
  };

  Object.defineProperty(this, 'body', {
    get: function get() {
      return body;
    }
  });

  Object.defineProperty(this, 'text', {
    enumerable: true,
    get: getText
  });

  Object.defineProperty(this, 'data', {
    enumerable: true,
    get: getData
  });
};

exports.default = HTTPResponse;