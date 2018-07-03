/* @flow */

const { randomBytes, createHash } = require('crypto');

// Returns a new random hex string of the given even size.
function randomHexString(size: number): string {
  if (size === 0) {
    throw new Error('Zero-length randomHexString is useless.');
  }
  if (size % 2 !== 0) {
    throw new Error('randomHexString size must be divisible by 2.')
  }
  return randomBytes(size / 2).toString('hex');
}

// Returns a new random alphanumeric string of the given size.
//
// Note: to simplify implementation, the result has slight modulo bias,
// because chars length of 62 doesn't divide the number of all bytes
// (256) evenly. Such bias is acceptable for most cases when the output
// length is long enough and doesn't need to be uniform.
function randomString(size: number): string {
  if (size === 0) {
    throw new Error('Zero-length randomString is useless.');
  }
  const chars = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
               'abcdefghijklmnopqrstuvwxyz' +
               '0123456789');
  let objectId = '';
  const bytes = randomBytes(size);
  for (let i = 0; i < bytes.length; ++i) {
    objectId += chars[bytes.readUInt8(i) % chars.length];
  }
  return objectId;
}

// Returns a new random alphanumeric string suitable for object ID.
function newObjectId(size: number = 10): string {
  return randomString(size);
}

// Returns a new random hex string suitable for secure tokens.
function newToken(): string {
  return randomHexString(32);
}

function md5Hash(string: string): string {
  return createHash('md5').update(string).digest('hex');
}

module.exports = {
  randomString,
  randomHexString,
  md5Hash,
  newToken,
  newObjectId,
}
