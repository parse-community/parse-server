'use strict';

// Helper functions for accessing the google API.
//var Parse = require('parse/node').Parse;
var crypto = require('crypto');
var request = require('request');
var url = require('url');

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData)
{
  return new Promise(function (resolve, reject)
  {
    var identity = {
      publicKeyUrl: authData.pKeyUrl,
      timestamp: authData.timeStamp,
      signature: authData.sig,
      salt: authData.salt,
      playerId: authData.id,
      bundleId: authData.bid
    };

    return verify(identity, function (err, token)
    {
      if(err)
        return reject('Failed to validate this access token with Game Center.');
      else
        return resolve(token);
    });
  });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

function verifyPublicKeyUrl(publicKeyUrl) {
  var parsedUrl = url.parse(publicKeyUrl);
  if (parsedUrl.protocol !== 'https:') {
    return false;
  }

  var hostnameParts = parsedUrl.hostname.split('.');
  var domain = hostnameParts[hostnameParts.length - 2] + "." + hostnameParts[hostnameParts.length - 1];
  if (domain !== 'apple.com') {
    return false;
  }

  return true;
}

function convertX509CertToPEM(X509Cert) {
  var pemPreFix = '-----BEGIN CERTIFICATE-----\n';
  var pemPostFix = '-----END CERTIFICATE-----';

  var base64 = X509Cert.toString('base64');
  var certBody = base64.match(new RegExp('.{0,64}', 'g')).join('\n');

  return pemPreFix + certBody + pemPostFix;
}

function getAppleCertificate(publicKeyUrl, callback) {
  if (!verifyPublicKeyUrl(publicKeyUrl)) {
    callback(new Error('Invalid publicKeyUrl'), null);
    return;
  }

  var options = {
    uri: publicKeyUrl,
    encoding: null
  };
  request.get(options, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      var cert = convertX509CertToPEM(body);
      callback(null, cert);
    } else {
      callback(error, null);
    }
  });
}

/* jslint bitwise:true */
function convertTimestampToBigEndian(timestamp) {
  // The timestamp parameter in Big-Endian UInt-64 format
  var buffer = new Buffer(8);
  buffer.fill(0);

  var high = ~~(timestamp / 0xffffffff); // jshint ignore:line
  var low = timestamp % (0xffffffff + 0x1); // jshint ignore:line

  buffer.writeUInt32BE(parseInt(high, 10), 0);
  buffer.writeUInt32BE(parseInt(low, 10), 4);

  return buffer;
}
/* jslint bitwise:false */

function verifySignature(publicKey, idToken) {
  var verifier = crypto.createVerify('sha256');
  verifier.update(idToken.playerId, 'utf8');
  verifier.update(idToken.bundleId, 'utf8');
  verifier.update(convertTimestampToBigEndian(idToken.timestamp));
  verifier.update(idToken.salt, 'base64');

  if (!verifier.verify(publicKey, idToken.signature, 'base64')) {
    throw new Error('Invalid Signature');
  }
}

function verify(idToken, callback) {
  getAppleCertificate(idToken.publicKeyUrl, function (err, publicKey) {
    if (!err) {
      try {
        verifySignature(publicKey, idToken);
        callback(null, idToken);
      } catch (e) {
        callback(e, null);
      }
    } else {
      callback(err, null);
    }
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
