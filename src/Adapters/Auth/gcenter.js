/**
 * Parse Server authentication adapter for Apple Game Center.
 *
 * @class AppleGameCenterAdapter
 * @param {Object} options - Configuration options for the adapter.
 * @param {string} options.bundleId - Your Apple Game Center bundle ID. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @param {Object} authData - The authentication data provided by the client.
 * @param {string} authData.id - The user ID obtained from Apple Game Center.
 * @param {string} authData.publicKeyUrl - The public key URL obtained from Apple Game Center.
 * @param {string} authData.timestamp - The timestamp obtained from Apple Game Center.
 * @param {string} authData.signature - The signature obtained from Apple Game Center.
 * @param {string} authData.salt - The salt obtained from Apple Game Center.
 * @param {string} [authData.bundleId] - **[DEPRECATED]** The bundle ID obtained from Apple Game Center (required for insecure authentication).
 *
 * @description
 * ## Parse Server Configuration
 * The following `authData` fields are required:
 * `id`, `publicKeyUrl`, `timestamp`, `signature`, and `salt`. These fields are validated against the configured `bundleId` for additional security.
 *
 * To configure Parse Server for Apple Game Center authentication, use the following structure:
 * ```json
 * {
 *  "auth": {
 *    "gcenter": {
 *     "bundleId": "com.valid.app"
 *  }
 * }
 * ```
 *
 * ## Insecure Authentication (Not Recommended)
 * The following `authData` fields are required for insecure authentication:
 * `id`, `publicKeyUrl`, `timestamp`, `signature`, `salt`, and `bundleId` (**[DEPRECATED]**). This flow is insecure and poses potential security risks.
 *
 * To configure Parse Server for insecure authentication, use the following structure:
 * ```json
 * {
 *   "auth": {
 *    "gcenter": {
 *      "enableInsecureAuth": true
 *   }
 * }
 * ```
 *
 * ### Deprecation Notice
 * The `enableInsecureAuth` option and `authData.bundleId` parameter are deprecated and may be removed in future releases. Use secure authentication with the `bundleId` configured in the `options` object instead.
 *
 *
 * @example <caption>Secure Authentication Example</caption>
 * // Example authData for secure authentication:
 * const authData = {
 *   gcenter: {
 *     id: "1234567",
 *     publicKeyUrl: "https://valid.apple.com/public/timeout.cer",
 *     timestamp: 1460981421303,
 *     salt: "saltST==",
 *     signature: "PoDwf39DCN464B49jJCU0d9Y0J"
 *   }
 * };
 *
 * @example <caption>Insecure Authentication Example (Not Recommended)</caption>
 * // Example authData for insecure authentication:
 * const authData = {
 *   gcenter: {
 *     id: "1234567",
 *     publicKeyUrl: "https://valid.apple.com/public/timeout.cer",
 *     timestamp: 1460981421303,
 *     salt: "saltST==",
 *     signature: "PoDwf39DCN464B49jJCU0d9Y0J",
 *     bundleId: "com.valid.app" // Deprecated.
 *   }
 * };
 *
 * @see {@link https://developer.apple.com/documentation/gamekit/gklocalplayer/3516283-fetchitems Apple Game Center Documentation}
 */
/* global BigInt */

import crypto from 'crypto';
import { asn1, pki } from 'node-forge';
import AuthAdapter from './AuthAdapter';
class GameCenterAuth extends AuthAdapter {
  constructor() {
    super();
    this.ca = { cert: null, url: null };
    this.cache = {};
    this.bundleId = '';
  }

  validateOptions(options) {
    if (!options) {
      throw new Error('Game center auth options are required.');
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadCertificate(options);
    }

    this.enableInsecureAuth = options.enableInsecureAuth;
    this.bundleId = options.bundleId;

    if (!this.enableInsecureAuth && !this.bundleId) {
      throw new Error('bundleId is required for secure auth.');
    }
  }

  async loadCertificate(options) {
    const rootCertificateUrl =
      options.rootCertificateUrl ||
      'https://cacerts.digicert.com/DigiCertTrustedG4CodeSigningRSA4096SHA3842021CA1.crt.pem';

    if (this.ca.url === rootCertificateUrl) {
      return rootCertificateUrl;
    }

    const { certificate, headers } = await this.fetchCertificate(rootCertificateUrl);

    if (
      headers.get('content-type') !== 'application/x-pem-file' ||
      !headers.get('content-length') ||
      parseInt(headers.get('content-length'), 10) > 10000
    ) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid rootCertificateURL.');
    }

    this.ca.cert = pki.certificateFromPem(certificate);
    this.ca.url = rootCertificateUrl;

    return rootCertificateUrl;
  }

  verifyPublicKeyUrl(publicKeyUrl) {
    const regex = /^https:\/\/(?:[-_A-Za-z0-9]+\.){0,}apple\.com\/.*\.cer$/;
    return regex.test(publicKeyUrl);
  }

  async fetchCertificate(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch certificate: ${url}`);
    }

    const contentType = response.headers.get('content-type');
    const isPem = contentType?.includes('application/x-pem-file');

    if (isPem) {
      const certificate = await response.text();
      return { certificate, headers: response.headers };
    }

    const data = await response.arrayBuffer();
    const binaryData = Buffer.from(data);

    const asn1Cert = asn1.fromDer(binaryData.toString('binary'));
    const forgeCert = pki.certificateFromAsn1(asn1Cert);
    const certificate = pki.certificateToPem(forgeCert);

    return { certificate, headers: response.headers };
  }

  async getAppleCertificate(publicKeyUrl) {
    if (!this.verifyPublicKeyUrl(publicKeyUrl)) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Invalid publicKeyUrl: ${publicKeyUrl}`);
    }

    if (this.cache[publicKeyUrl]) {
      return this.cache[publicKeyUrl];
    }

    const { certificate, headers } = await this.fetchCertificate(publicKeyUrl);
    const cacheControl = headers.get('cache-control');
    const expire = cacheControl?.match(/max-age=([0-9]+)/);

    this.verifyPublicKeyIssuer(certificate, publicKeyUrl);

    if (expire) {
      this.cache[publicKeyUrl] = certificate;
      setTimeout(() => delete this.cache[publicKeyUrl], parseInt(expire[1], 10) * 1000);
    }

    return certificate;
  }

  verifyPublicKeyIssuer(cert, publicKeyUrl) {
    const publicKeyCert = pki.certificateFromPem(cert);

    if (!this.ca.cert) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Root certificate is invalid or missing.'
      );
    }

    if (!this.ca.cert.verify(publicKeyCert)) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Invalid publicKeyUrl: ${publicKeyUrl}`);
    }
  }

  verifySignature(publicKey, authData) {
    const bundleId = this.bundleId || (this.enableInsecureAuth && authData.bundleId);

    const verifier = crypto.createVerify('sha256');
    verifier.update(Buffer.from(authData.id, 'utf8'));
    verifier.update(Buffer.from(bundleId, 'utf8'));
    verifier.update(this.convertTimestampToBigEndian(authData.timestamp));
    verifier.update(Buffer.from(authData.salt, 'base64'));

    if (!verifier.verify(publicKey, authData.signature, 'base64')) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid signature.');
    }
  }

  async validateAuthData(authData) {

    const requiredKeys = ['id', 'publicKeyUrl', 'timestamp', 'signature', 'salt'];
    if (this.enableInsecureAuth) {
      requiredKeys.push('bundleId');
    }

    for (const key of requiredKeys) {
      if (!authData[key]) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `AuthData ${key} is missing.`);
      }
    }

    await this.loadingPromise;

    const publicKey = await this.getAppleCertificate(authData.publicKeyUrl);
    this.verifySignature(publicKey, authData);
  }

  convertTimestampToBigEndian(timestamp) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(timestamp));
    return buffer;
  }
}

export default new GameCenterAuth();
