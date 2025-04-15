import Parse from 'parse/node';
import ParseServer from './cloud-code/Parse.Server';

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
  applicationId: Parse.applicationId,
  _decode: Parse._decode,
  _encode: Parse._encode,
  CLP: Parse.CLP, // types?
  CoreManager: Parse.CoreManager,
  Config: Parse.Config, // Cloud trigger class name
  Error: Parse.Error,
  File: Parse.File, // cloud trigger class name
  GeoPoint: Parse.GeoPoint, // toRadians
  Polygon: Parse.Polygon, // containsPoints
  Object: Parse.Object, // fromJSON, create new Objects
  Query: Parse.Query, // instanceof, new query
  Schema: Parse.Schema, // types? new schema
  Session: Parse.Session, // fromJSON
  User: Parse.User, // fromJSON
  Server: ParseServer,
  compatible,
  supportsForwardDelete,
  fromString,
};
