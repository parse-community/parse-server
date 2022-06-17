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
const { pki } = require('node-forge');
const ca = { cert: null, url: null };
const cache = {}; // (publicKey -> cert) cache

function verifyPublicKeyUrl(publicKeyUrl) {
  try {
    const regex = /^https:\/\/(?:[-_A-Za-z0-9]+\.){0,}apple\.com\/.*\.cer$/;
    return regex.test(publicKeyUrl);
  } catch (error) {
    return false;
  }
}

function convertX509CertToPEM(X509Cert) {
  const pemPreFix = '-----BEGIN CERTIFICATE-----\n';
  const pemPostFix = '-----END CERTIFICATE-----';

  const base64 = X509Cert;
  const certBody = base64.match(new RegExp('.{0,64}', 'g')).join('\n');

  return pemPreFix + certBody + pemPostFix;
}

async function getAppleCertificate(publicKeyUrl) {
  if (!verifyPublicKeyUrl(publicKeyUrl)) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Apple Game Center - invalid publicKeyUrl: ${publicKeyUrl}`
    );
  }
  if (cache[publicKeyUrl]) {
    return cache[publicKeyUrl];
  }
  const url = new URL(publicKeyUrl);
  const headOptions = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'HEAD',
  };
  const cert_headers = await new Promise((resolve, reject) =>
    https.get(headOptions, res => resolve(res.headers)).on('error', reject)
  );
  const validContentTypes = ['application/x-x509-ca-cert', 'application/pkix-cert'];
  if (
    !validContentTypes.includes(cert_headers['content-type']) ||
    cert_headers['content-length'] == null ||
    cert_headers['content-length'] > 10000
  ) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Apple Game Center - invalid publicKeyUrl: ${publicKeyUrl}`
    );
  }
  const { certificate, headers } = await getCertificate(publicKeyUrl);
  if (headers['cache-control']) {
    const expire = headers['cache-control'].match(/max-age=([0-9]+)/);
    if (expire) {
      cache[publicKeyUrl] = certificate;
      // we'll expire the cache entry later, as per max-age
      setTimeout(() => {
        delete cache[publicKeyUrl];
      }, parseInt(expire[1], 10) * 1000);
    }
  }
  return verifyPublicKeyIssuer(certificate, publicKeyUrl);
}

function getCertificate(url, buffer) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        const data = [];
        res.on('data', chunk => {
          data.push(chunk);
        });
        res.on('end', () => {
          if (buffer) {
            resolve({ certificate: Buffer.concat(data), headers: res.headers });
            return;
          }
          let cert = '';
          for (const chunk of data) {
            cert += chunk.toString('base64');
          }
          const certificate = convertX509CertToPEM(cert);
          resolve({ certificate, headers: res.headers });
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

function verifyPublicKeyIssuer(cert, publicKeyUrl) {
  const publicKeyCert = pki.certificateFromPem(cert);
  if (!ca.cert) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Apple Game Center auth adapter parameter `rootCertificateURL` is invalid.'
    );
  }
  try {
    if (!ca.cert.verify(publicKeyCert)) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `Apple Game Center - invalid publicKeyUrl: ${publicKeyUrl}`
      );
    }
  } catch (e) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Apple Game Center - invalid publicKeyUrl: ${publicKeyUrl}`
    );
  }
  return cert;
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
async function validateAppId(appIds, authData, options = {}) {
  if (!options.rootCertificateUrl) {
    options.rootCertificateUrl =
      'https://cacerts.digicert.com/DigiCertTrustedG4CodeSigningRSA4096SHA3842021CA1.crt.pem';
  }
  if (ca.url === options.rootCertificateUrl) {
    return;
  }
  const { certificate, headers } = await getCertificate(options.rootCertificateUrl, true);
  if (
    headers['content-type'] !== 'application/x-pem-file' ||
    headers['content-length'] == null ||
    headers['content-length'] > 10000
  ) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Apple Game Center auth adapter parameter `rootCertificateURL` is invalid.'
    );
  }
  ca.cert = pki.certificateFromPem(certificate);
  ca.url = options.rootCertificateUrl;
}

module.exports = {
  validateAppId,
  validateAuthData,
  cache,
};
