// Tools for encrypting and decrypting passwords.
// Basically promise-friendly wrappers for bcrypt.
var bcrypt = require('bcryptjs');

try {
  bcrypt = require('bcrypt');
} catch(e) {}

// Returns a promise for a hashed password string.
function hash(password) {
  return new Promise(function(fulfill, reject) {
    bcrypt.hash(password, 10, function(err, hashedPassword) {
      if (err) {
        reject(err);
      } else {
        fulfill(hashedPassword);
      }
    });
  });
}

// Returns a promise for whether this password compares to equal this
// hashed password.
function compare(password, hashedPassword) {
  return new Promise(function(fulfill, reject) {
    // Cannot bcrypt compare when one is undefined
    if (!password || !hashedPassword) {
      return fulfill(false);
    }
    bcrypt.compare(password, hashedPassword, function(err, success) {
      if (err) {
        reject(err);
      } else {
        fulfill(success);
      }
    });
  });
}

module.exports = {
  hash: hash,
  compare: compare
};
