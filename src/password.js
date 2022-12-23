// Tools for encrypting and decrypting passwords.
// Basically promise-friendly wrappers for bcrypt.
var bcrypt = require('bcryptjs');
var crypto = require('crypto');
try {
  const _bcrypt = require('@node-rs/bcrypt');
  bcrypt = {
    hash: _bcrypt.hash,
    compare: _bcrypt.verify,
  };
} catch (e) {
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
  if(hashedPassword.startsWith("$1$")) {
    return `$1$${crypto.createHash('md5').update(password).digest("hex")}` == hashedPassword;
  } else {
    return bcrypt.compare(password, hashedPassword);
  }
}

module.exports = {
  hash: hash,
  compare: compare,
};
