/* Apple Game Center Auth
https://developer.apple.com/documentation/gamekit/gklocalplayer/1515407-generateidentityverificationsign#discussion

const authData = {
  publicKeyUrl: 'https://valid.apple.com/public/timeout.cer',
  timestamp: 1460981421303,
  signature: 'PoDwf39DCN464B49jJCU0d9Y0J',
  salt: 'saltST==',
  bundleId: 'com.valid.app'
  id: 'playerId',
};
*/

const { Parse } = require('parse/node');
const crypto = require('crypto');
const https = require('https');
const url = require('url');

const cache = {}; // (publicKey -> cert) cache

function verifyPublicKeyUrl(publicKeyUrl) {
  const parsedUrl = url.parse(publicKeyUrl);
  if (parsedUrl.protocol !== 'https:') {
    return false;
  }
  const hostnameParts = parsedUrl.hostname.split('.');
  const length = hostnameParts.length;
  const domainParts = hostnameParts.slice(length - 2, length);
  const domain = domainParts.join('.');
  return domain === 'apple.com';
}

function convertX509CertToPEM(X509Cert) {
  const pemPreFix = '-----BEGIN CERTIFICATE-----\n';
  const pemPostFix = '-----END CERTIFICATE-----';

  const base64 = X509Cert;
  const certBody = base64.match(new RegExp('.{0,64}', 'g')).join('\n');

  return pemPreFix + certBody + pemPostFix;
}

function getAppleCertificate(publicKeyUrl) {
  if (!verifyPublicKeyUrl(publicKeyUrl)) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Apple Game Center - invalid publicKeyUrl: ${publicKeyUrl}`
    );
  }
  if (cache[publicKeyUrl]) {
    return cache[publicKeyUrl];
  }
  return new Promise((resolve, reject) => {
    https
      .get(publicKeyUrl, res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk.toString('base64');
        });
        res.on('end', () => {
          const cert = convertX509CertToPEM(data);
          if (res.headers['cache-control']) {
            var expire = res.headers['cache-control'].match(/max-age=([0-9]+)/);
            if (expire) {
              cache[publicKeyUrl] = cert;
              // we'll expire the cache entry later, as per max-age
              setTimeout(() => {
                delete cache[publicKeyUrl];
              }, parseInt(expire[1], 10) * 1000);
            }
          }
          resolve(cert);
        });
      })
      .on('error', reject);
  });
}

function convertTimestampToBigEndian(timestamp) {
  const buffer = Buffer.alloc(8);

  const high = ~~(timestamp / 0xffffffff);
  const low = timestamp % (0xffffffff + 0x1);

  buffer.writeUInt32BE(parseInt(high, 10), 0);
  buffer.writeUInt32BE(parseInt(low, 10), 4);

  return buffer;
}

function verifySignature(publicKey, authData) {
  const verifier = crypto.createVerify('sha256');
  verifier.update(authData.playerId, 'utf8');
  verifier.update(authData.bundleId, 'utf8');
  verifier.update(convertTimestampToBigEndian(authData.timestamp));
  verifier.update(authData.salt, 'base64');

  if (!verifier.verify(publicKey, authData.signature, 'base64')) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Apple Game Center - invalid signature');
  }
}

// Returns a promise that fulfills if this user id is valid.
async function validateAuthData(authData) {
  if (!authData.id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Apple Game Center - authData id missing');
  }
  authData.playerId = authData.id;
  const publicKey = await getAppleCertificate(authData.publicKeyUrl);
  return verifySignature(publicKey, authData);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};
