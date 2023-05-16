// Helper functions for accessing the Facebook Graph API.
import { Parse } from 'parse/node';
import crypto from 'crypto';
import jwksClient from 'jwks-rsa';
import util from 'util';
import jwt from 'jsonwebtoken';
import httpsRequest from './httpsRequest';
import authUtils from './utils';
import AuthAdapter from './AuthAdapter';

class FacebookAdapter extends AuthAdapter {
  constructor() {
    super();
    this._TOKEN_ISSUER = 'https://facebook.com';
  }
  validateAuthData(authData, options) {
    if (authData.token) {
      return this.verifyIdToken(authData, options);
    }
    return this.validateGraphToken(authData);
  }

  validateAppId(_, authData) {
    if (authData.token) {
      return Promise.resolve();
    }
    return this.validateGraphAppId(authData);
  }

  validateOptions(opts) {
    const appIds = opts?.appIds;
    if (!Array.isArray(appIds)) {
      throw 'facebook.appIds must be an array.';
    }
    if (!appIds.length) {
      throw 'facebook.appIds must have at least one appId.';
    }
    this.appIds = appIds;
    this.appSecret = opts?.appSecret;
  }

  graphRequest(path) {
    return httpsRequest.get(`https://graph.facebook.com/${path}`);
  }

  getAppSecretPath(authData) {
    const appSecret = this.appSecret;
    if (!appSecret) {
      return '';
    }
    const appsecret_proof = crypto
      .createHmac('sha256', appSecret)
      .update(authData.access_token)
      .digest('hex');

    return `&appsecret_proof=${appsecret_proof}`;
  }

  async validateGraphToken(authData) {
    const data = await this.graphRequest(
      `me?fields=id&access_token=${authData.access_token}${this.getAppSecretPath(authData)}`
    );
    if (data?.id === authData.id || (process.env.TESTING && authData.id === 'test')) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is invalid for this user.');
  }

  async validateGraphAppId(authData) {
    const access_token = authData.access_token;
    if (process.env.TESTING && access_token === 'test') {
      return;
    }
    const data = await this.graphRequest(
      `app?access_token=${access_token}${this.getAppSecretPath(authData)}`
    );
    if (!data || !this.appIds.includes(data.id)) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Facebook auth is invalid for this user.'
      );
    }
  }

  async getFacebookKeyByKeyId(keyId, cacheMaxEntries, cacheMaxAge) {
    const client = jwksClient({
      jwksUri: `${this._TOKEN_ISSUER}/.well-known/oauth/openid/jwks/`,
      cache: true,
      cacheMaxEntries,
      cacheMaxAge,
    });

    const asyncGetSigningKeyFunction = util.promisify(client.getSigningKey);

    let key;
    try {
      key = await asyncGetSigningKeyFunction(keyId);
    } catch (error) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `Unable to find matching key for Key ID: ${keyId}`
      );
    }
    return key;
  }

  async verifyIdToken({ token, id }, { clientId, cacheMaxEntries, cacheMaxAge }) {
    if (!token) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'id token is invalid for this user.');
    }

    const { kid: keyId, alg: algorithm } = authUtils.getHeaderFromToken(token);
    const ONE_HOUR_IN_MS = 3600000;
    let jwtClaims;

    cacheMaxAge = cacheMaxAge || ONE_HOUR_IN_MS;
    cacheMaxEntries = cacheMaxEntries || 5;

    const facebookKey = await this.getFacebookKeyByKeyId(keyId, cacheMaxEntries, cacheMaxAge);
    const signingKey = facebookKey.publicKey || facebookKey.rsaPublicKey;

    try {
      jwtClaims = jwt.verify(token, signingKey, {
        algorithms: algorithm,
        // the audience can be checked against a string, a regular expression or a list of strings and/or regular expressions.
        audience: clientId,
      });
    } catch (exception) {
      const message = exception.message;

      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
    }

    if (jwtClaims.iss !== this._TOKEN_ISSUER) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `id token not issued by correct OpenID provider - expected: ${this._TOKEN_ISSUER} | from: ${jwtClaims.iss}`
      );
    }

    if (jwtClaims.sub !== id) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'auth data is invalid for this user.');
    }
    return jwtClaims;
  }
}

export default new FacebookAdapter();
