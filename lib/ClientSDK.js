'use strict';

var semver = require('semver');

function compatible(compatibleSDK) {
  return function (clientSDK) {
    if (typeof clientSDK === 'string') {
      clientSDK = fromString(clientSDK);
    }
    // REST API, or custom SDK
    if (!clientSDK) {
      return true;
    }
    var clientVersion = clientSDK.version;
    var compatiblityVersion = compatibleSDK[clientSDK.sdk];
    return semver.satisfies(clientVersion, compatiblityVersion);
  };
}

function supportsForwardDelete(clientSDK) {
  return compatible({
    js: '>=1.9.0'
  })(clientSDK);
}

function fromString(version) {
  var versionRE = /([-a-zA-Z]+)([0-9\.]+)/;
  var match = version.toLowerCase().match(versionRE);
  if (match && match.length === 3) {
    return {
      sdk: match[1],
      version: match[2]
    };
  }
  return undefined;
}

module.exports = {
  compatible: compatible,
  supportsForwardDelete: supportsForwardDelete,
  fromString: fromString
};