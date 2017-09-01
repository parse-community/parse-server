import Parse    from 'parse/node';
import deepcopy from 'deepcopy';

export function isPushIncrementing(body) {
  return body.data &&
         body.data.badge &&
         typeof body.data.badge == 'string' &&
         body.data.badge.toLowerCase() == "increment"
}

const localizableKeys = ['alert', 'title'];

export function getLocalesFromPush(body) {
  const data = body.data;
  if (!data) {
    return [];
  }
  return [...new Set(Object.keys(data).reduce((memo, key) => {
    localizableKeys.forEach((localizableKey) => {
      if (key.indexOf(`${localizableKey}-`) == 0) {
        memo.push(key.slice(localizableKey.length + 1));
      }
    });
    return memo;
  }, []))];
}

export function transformPushBodyForLocale(body, locale) {
  const data = body.data;
  if (!data) {
    return body;
  }
  body = deepcopy(body);
  localizableKeys.forEach((key) => {
    const localeValue = body.data[`${key}-${locale}`];
    if (localeValue) {
      body.data[key] = localeValue;
    }
  });
  return stripLocalesFromBody(body);
}

export function stripLocalesFromBody(body) {
  if (!body.data) { return body; }
  Object.keys(body.data).forEach((key) => {
    localizableKeys.forEach((localizableKey) => {
      if (key.indexOf(`${localizableKey}-`) == 0) {
        delete body.data[key];
      }
    });
  });
  return body;
}

export function bodiesPerLocales(body, locales = []) {
  // Get all tranformed bodies for each locale
  const result = locales.reduce((memo, locale) => {
    memo[locale] = transformPushBodyForLocale(body, locale);
    return memo;
  }, {});
  // Set the default locale, with the stripped body
  result.default = stripLocalesFromBody(body);
  return result;
}

export function groupByLocaleIdentifier(installations, locales = []) {
  return installations.reduce((map, installation) => {
    let added = false;
    locales.forEach((locale) => {
      if (added) {
        return;
      }
      if (installation.localeIdentifier && installation.localeIdentifier.indexOf(locale) === 0) {
        added = true;
        map[locale] = map[locale] || [];
        map[locale].push(installation);
      }
    });
    if (!added) {
      map.default.push(installation);
    }
    return map;
  }, {default: []});
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

export function applyDeviceTokenExists(where) {
  where = deepcopy(where);
  if (!where.hasOwnProperty('deviceToken')) {
    where['deviceToken'] = {'$exists': true};
  }
  return where;
}
