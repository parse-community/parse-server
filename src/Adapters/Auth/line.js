/**
 * Parse Server authentication adapter for Line.
 *
 * @class LineAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Line App Client ID. Required for secure authentication.
 * @param {string} [options.clientSecret] - Your Line App Client Secret. Required for authorization code exchange and HS256 token verification.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Line authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "line": {
 *       "clientId": "your-client-id"
 *     }
 *   }
 * }
 * ```
 * Add `clientSecret` when you also want Parse Server to exchange authorization codes:
 * ```json
 * {
 *   "auth": {
 *     "line": {
 *       "clientId": "your-client-id",
 *       "clientSecret": "your-client-secret"
 *     }
 *   }
 * }
 * ```
 * ### Insecure Configuration (Not Recommended)
 * ```json
 * {
 *   "auth": {
 *     "line": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `id_token`, optionally `id` and `nonce`.
 * - **Secure Authentication**: `code`, `redirect_uri`.
 * - **Insecure Authentication (Not Recommended)**: `id`, `access_token`.
 *
 * ## Auth Payloads
 * ### Secure ID Token Payload
 * ```json
 * {
 *   "line": {
 *     "id": "1234567",
 *     "id_token": "xxxxx.yyyyy.zzzzz"
 *   }
 * }
 * ```
 *
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "line": {
 *     "code": "xxxxxxxxx",
 *     "redirect_uri": "https://example.com/callback"
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "line": {
 *     "id": "1234567",
 *     "access_token": "xxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `enableInsecureAuth` is **not recommended** and will be removed in future versions.
 * - Secure authentication can validate a client-provided `id_token` locally when the token is signed with LINE's OIDC keys.
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using LINE's OAuth flow.
 *
 * @see {@link https://developers.line.biz/en/docs/line-login/integrate-line-login/ Line Login Documentation}
 */

import BaseCodeAuthAdapter from './BaseCodeAuthAdapter';
const Parse = require('parse/node').Parse;
const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const authUtils = require('./utils');

// LINE documents the OIDC issuer as `https://access.line.me` in both:
// https://developers.line.biz/en/docs/line-login/verify-id-token/
// https://access.line.me/.well-known/openid-configuration
const TOKEN_ISSUER = 'https://access.line.me';
const ONE_HOUR_IN_MS = 3600000;

/**
 * Resolves the LINE signing key for an ES256 `id_token` using the token header `kid`.
 * (responses are cached the same way the other auth adapters do)
 * @returns The signing key returned by `jwks-rsa`.
 */
const getLineKeyByKeyId = async (
  /** @type {string} The JWT header `kid`. */
  keyId,
  /** Maximum number of cached JWKS entries */
  cacheMaxEntries,
  /** Maximum JWKS cache age in milliseconds */
  cacheMaxAge) => {
  const client = jwksClient({
    jwksUri: 'https://api.line.me/oauth2/v2.1/certs',
    cache: true,
    cacheMaxEntries,
    cacheMaxAge,
  });

  let key;
  try {
    key = await authUtils.getSigningKey(client, keyId);
  } catch {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Unable to find matching key for Key ID: ${keyId}`
    );
  }
  return key;
};

class LineAdapter extends BaseCodeAuthAdapter {
  constructor() {
    super('Line');
  }

  validateOptions(options) {
    if (!options) {
      throw new Error('Line options are required.');
    }

    this.enableInsecureAuth = options.enableInsecureAuth;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.cacheMaxEntries = options.cacheMaxEntries;
    this.cacheMaxAge = options.cacheMaxAge;

    // Keep the legacy insecure mode backward-compatible when a deployment opts in
    // to `enableInsecureAuth` only and does not want to configure OIDC/code flow.
    if (this.enableInsecureAuth && !this.clientId && !this.clientSecret) {
      return;
    }

    // `clientId` is the minimum requirement for secure LINE auth because both
    // `id_token` audience checks and code-flow token exchange are channel-bound.
    if (!this.clientId) {
      throw new Error('Line clientId is required.');
    }
  }

  /**
   * Validates a LINE OpenID Connect `id_token` and returns the verified claims.
   * Supports LINE's ES256 native/LIFF tokens and HS256 web-login tokens.
   * authData payload : id_token + id + nonce; strings.
   * @returns {Promise<Object>} The verified JWT claims.
   */
  async verifyIdToken({ id_token: token, id, nonce }) {
    if (!this.clientId) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Line auth is not configured.');
    }

    if (!token) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'id token is invalid for this user.');
    }

    const { kid: keyId, alg } = authUtils.getHeaderFromToken(token);
    const cacheMaxAge = this.cacheMaxAge || ONE_HOUR_IN_MS;
    const cacheMaxEntries = this.cacheMaxEntries || 5;
    let jwtClaims;

    try {
      // Read the alg field, but guard algorithms to ones LINE actually supports/documents.
      if (alg === 'ES256') {
        const lineKey = await getLineKeyByKeyId(keyId, cacheMaxEntries, cacheMaxAge);
        const signingKey = lineKey.publicKey || lineKey.rsaPublicKey;
        jwtClaims = jwt.verify(token, signingKey, {
          algorithms: ['ES256'],
          audience: this.clientId,
        });
      } else if (alg === 'HS256') {
        if (!this.clientSecret) {
          throw new Parse.Error(
            Parse.Error.OBJECT_NOT_FOUND,
            'Line clientSecret is required to verify HS256 id_token.'
          );
        }
        jwtClaims = jwt.verify(token, this.clientSecret, {
          algorithms: ['HS256'],
          audience: this.clientId,
        });
      } else {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          `Unsupported Line id_token signing algorithm: ${alg}`
        );
      }
    } catch (exception) {
      const message = exception.message;
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
    }

    if (jwtClaims.iss !== TOKEN_ISSUER) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `id token not issued by correct OpenID provider - expected: ${TOKEN_ISSUER} | from: ${jwtClaims.iss}`
      );
    }

    if (id && jwtClaims.sub !== id) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'auth data is invalid for this user.');
    }

    if (nonce && jwtClaims.nonce !== nonce) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'auth data is invalid for this user.');
    }

    return jwtClaims;
  }

  async beforeFind(authData) {
    if (authData?.id_token) {
      // Set authData.id from the verified LINE token subject if id_token exists and is valid.
      const jwtClaims = await this.verifyIdToken(authData);
      authData.id = jwtClaims.sub;
      delete authData.id_token;
      delete authData.nonce;
      return;
    }

    return super.beforeFind(authData);
  }

  /**
   * Exchanges a LINE authorization code for an access token.
   * authData = code + redirect_uri
   */
  async getAccessTokenFromCode(authData) {
    if (!authData.code) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Line auth is invalid for this user.'
      );
    }

    // Assert clientSecret is present for code exchange flows.
    // id_token verification does not use it, so it is now optional and needs a check.
    if (!this.clientSecret) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Line clientSecret is required to exchange code for token.'
      );
    }

    const tokenUrl = 'https://api.line.me/oauth2/v2.1/token';
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: authData.redirect_uri,
        code: authData.code,
      }),
    });

    if (!response.ok) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `Failed to exchange code for token: ${response.statusText}`
      );
    }

    const data = await response.json();
    if (data.error) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        data.error_description || data.error
      );
    }

    return data.access_token;
  }

  /**
   * fetches the LINE profile associated with an access token
   * Also normalizes provider response into Parse's expected `{ id }` auth shape.
   */
  async getUserFromAccessToken(accessToken) {
    const userApiUrl = 'https://api.line.me/v2/profile';
    const response = await fetch(userApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        `Failed to fetch Line user: ${response.statusText}`
      );
    }

    const userData = await response.json();
    if (!userData?.userId) {
      throw new Parse.Error(
        Parse.Error.VALIDATION_ERROR,
        'Invalid Line user data received.'
      );
    }

    return {
      ...userData,
      // LINE profile responses return `userId`:
      // https://developers.line.biz/en/reference/line-login/#get-user-profile
      // BaseCodeAuthAdapter expects `id`.
      id: userData.userId,
    };
  }
}

export default new LineAdapter();
