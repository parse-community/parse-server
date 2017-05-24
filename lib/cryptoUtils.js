'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.randomHexString = randomHexString;
exports.randomString = randomString;
exports.newObjectId = newObjectId;
exports.newToken = newToken;
exports.md5Hash = md5Hash;

var _crypto = require('crypto');

// Returns a new random hex string of the given even size.
function randomHexString(size) {
  if (size === 0) {
    throw new Error('Zero-length randomHexString is useless.');
  }
  if (size % 2 !== 0) {
    throw new Error('randomHexString size must be divisible by 2.');
  }
  return (0, _crypto.randomBytes)(size / 2).toString('hex');
}

// Returns a new random alphanumeric string of the given size.
//
// Note: to simplify implementation, the result has slight modulo bias,
// because chars length of 62 doesn't divide the number of all bytes
// (256) evenly. Such bias is acceptable for most cases when the output
// length is long enough and doesn't need to be uniform.


function randomString(size) {
  if (size === 0) {
    throw new Error('Zero-length randomString is useless.');
  }
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789';
  var objectId = '';
  var bytes = (0, _crypto.randomBytes)(size);
  for (var i = 0; i < bytes.length; ++i) {
    objectId += chars[bytes.readUInt8(i) % chars.length];
  }
  return objectId;
}

// Returns a new random alphanumeric string suitable for object ID.
function newObjectId() {
  //TODO: increase length to better protect against collisions.
  return randomString(10);
}

// Returns a new random hex string suitable for secure tokens.
function newToken() {
  return randomHexString(32);
}

function md5Hash(string) {
  return (0, _crypto.createHash)('md5').update(string).digest('hex');
}