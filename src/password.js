// Tools for encrypting and decrypting passwords.
// Basically promise-friendly wrappers for bcrypt.
var bcrypt = require('bcryptjs');

try {
  const _bcrypt = require('@node-rs/bcrypt');
  bcrypt = {
    hash: _bcrypt.hash,
    compare: _bcrypt.verify,
  };
} catch {
  /* */
}

// Returns a promise for a hashed password string.
function hash(password) {
  return bcrypt.hash(password, 10);
}

// Returns a promise for whether this password compares to equal this
// hashed password.
function compare(password, hashedPassword) {
  // Cannot bcrypt compare when one is undefined
  if (!password || !hashedPassword) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(password, hashedPassword);
}

// Pre-computed bcrypt hash (cost factor 10) used for timing normalization.
// The actual value is irrelevant; it ensures bcrypt.compare() runs with
// realistic cost even when no real password hash is available.
const dummyHash = '$2b$10$Wd1gvrMYPnQv5pHBbXCwCehxXmJSEzRqNON0ev98L6JJP5296S35i';

module.exports = {
  hash: hash,
  compare: compare,
  dummyHash: dummyHash,
};
