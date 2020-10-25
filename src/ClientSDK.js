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
    const clientVersion = clientSDK.version;
    const compatiblityVersion = compatibleSDK[clientSDK.sdk];
    return semver.satisfies(clientVersion, compatiblityVersion);
  };
}

function supportsForwardDelete(clientSDK) {
  return compatible({
    js: '>=1.9.0',
  })(clientSDK);
}

function fromString(version) {
  const versionRE = /([-a-zA-Z]+)([0-9\.]+)/;
  const match = version.toLowerCase().match(versionRE);
  if (match && match.length === 3) {
    return {
      sdk: match[1],
      version: match[2],
    };
  }
  return undefined;
}

module.exports = {
  compatible,
  supportsForwardDelete,
  fromString,
};
