'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isPushIncrementing = isPushIncrementing;
exports.validatePushType = validatePushType;

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isPushIncrementing(body) {
  return body.data && body.data.badge && typeof body.data.badge == 'string' && body.data.badge.toLowerCase() == "increment";
}

/**
 * Check whether the deviceType parameter in qury condition is valid or not.
 * @param {Object} where A query condition
 * @param {Array} validPushTypes An array of valid push types(string)
 */
function validatePushType() {
  var where = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var validPushTypes = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

  var deviceTypeField = where.deviceType || {};
  var deviceTypes = [];
  if (typeof deviceTypeField === 'string') {
    deviceTypes.push(deviceTypeField);
  } else if (Array.isArray(deviceTypeField['$in'])) {
    deviceTypes.concat(deviceTypeField['$in']);
  }
  for (var i = 0; i < deviceTypes.length; i++) {
    var deviceType = deviceTypes[i];
    if (validPushTypes.indexOf(deviceType) < 0) {
      throw new _node2.default.Error(_node2.default.Error.PUSH_MISCONFIGURED, deviceType + ' is not supported push type.');
    }
  }
}