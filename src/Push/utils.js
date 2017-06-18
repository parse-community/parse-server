import Parse from 'parse/node';

export function isPushIncrementing(body) {
  return body.data &&
         body.data.badge &&
         typeof body.data.badge == 'string' &&
         body.data.badge.toLowerCase() == "increment"
}

/**
 * Check whether the deviceType parameter in qury condition is valid or not.
 * @param {Object} where A query condition
 * @param {Array} validPushTypes An array of valid push types(string)
 */
export function validatePushType(where = {}, validPushTypes = []) {
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
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
        deviceType + ' is not supported push type.');
    }
  }
}
