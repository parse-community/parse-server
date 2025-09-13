/**
 * Parse Server authentication adapter for Twitter.
 *
 * @class TwitterAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.consumerKey - The Twitter App Consumer Key. Required for secure authentication.
 * @param {string} options.consumerSecret - The Twitter App Consumer Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Twitter authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "twitter": {
 *       "consumerKey": "your-consumer-key",
 *       "consumerSecret": "your-consumer-secret"
 *     }
 *   }
 * }
 * ```
 * ### Insecure Configuration (Not Recommended)
 * ```json
 * {
 *   "auth": {
 *     "twitter": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `oauth_token`, `oauth_verifier`.
 * - **Insecure Authentication (Not Recommended)**: `id`, `oauth_token`, `oauth_token_secret`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "twitter": {
 *     "oauth_token": "1234567890-abc123def456",
 *     "oauth_verifier": "abc123def456"
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "twitter": {
 *     "id": "1234567890",
 *     "oauth_token": "1234567890-abc123def456",
 *     "oauth_token_secret": "1234567890-abc123def456"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - **Deprecation Notice**: `enableInsecureAuth` and insecure fields (`id`, `oauth_token_secret`) are **deprecated** and may be removed in future versions. Use secure authentication with `consumerKey` and `consumerSecret`.
 * - Secure authentication exchanges the `oauth_token` and `oauth_verifier` provided by the client for an access token using Twitter's OAuth API.
 *
 * @see {@link https://developer.twitter.com/en/docs/authentication/oauth-1-0a Twitter OAuth Documentation}
 */

import Config from '../../Config';
import querystring from 'querystring';
import AuthAdapter from './AuthAdapter';

class TwitterAuthAdapter extends AuthAdapter {
  validateOptions(options) {
    if (!options) {
      throw new Error('Twitter auth options are required.');
    }

    this.enableInsecureAuth = options.enableInsecureAuth;

    if (!this.enableInsecureAuth && (!options.consumer_key || !options.consumer_secret)) {
      throw new Error('Consumer key and secret are required for secure Twitter auth.');
    }
  }

  async validateAuthData(authData, options) {
    const config = Config.get(Parse.applicationId);
    const twitterConfig = config.auth.twitter;

    if (this.enableInsecureAuth && twitterConfig && config.enableInsecureAuthAdapters) {
      return this.validateInsecureAuth(authData, options);
    }

    if (!options.consumer_key || !options.consumer_secret) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Twitter auth configuration missing consumer_key and/or consumer_secret.'
      );
    }

    const accessTokenData = await this.exchangeAccessToken(authData);

    if (accessTokenData?.oauth_token && accessTokenData?.user_id) {
      authData.id = accessTokenData.user_id;
      authData.auth_token = accessTokenData.oauth_token;
      return;
    }

    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Twitter auth is invalid for this user.'
    );
  }

  async validateInsecureAuth(authData, options) {
    if (!authData.oauth_token || !authData.oauth_token_secret) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Twitter insecure auth requires oauth_token and oauth_token_secret.'
      );
    }

    options = this.handleMultipleConfigurations(authData, options);

    const data = await this.request(authData, options);
    const parsedData = await data.json();

    if (parsedData?.id === authData.id) {
      return;
    }

    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Twitter auth is invalid for this user.'
    );
  }

  async exchangeAccessToken(authData) {
    const accessTokenRequestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: querystring.stringify({
        oauth_token: authData.oauth_token,
        oauth_verifier: authData.oauth_verifier,
      }),
    };

    const response = await fetch('https://api.twitter.com/oauth/access_token', accessTokenRequestOptions);
    if (!response.ok) {
      throw new Error('Failed to exchange access token.');
    }

    return response.json();
  }

  handleMultipleConfigurations(authData, options) {
    if (Array.isArray(options)) {
      const consumer_key = authData.consumer_key;

      if (!consumer_key) {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Twitter auth is invalid for this user.'
        );
      }

      options = options.filter(option => option.consumer_key === consumer_key);

      if (options.length === 0) {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Twitter auth is invalid for this user.'
        );
      }

      return options[0];
    }

    return options;
  }

  async request(authData, options) {
    const { consumer_key, consumer_secret } = options;

    const oauth = {
      consumer_key,
      consumer_secret,
      auth_token: authData.oauth_token,
      auth_token_secret: authData.oauth_token_secret,
    };

    const url = new URL('https://api.twitter.com/2/users/me');

    const response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + oauth.auth_token,
      },
      body: JSON.stringify(oauth),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user data.');
    }

    return response;
  }

  async beforeFind(authData) {
    if (this.enableInsecureAuth && !authData?.code) {
      if (!authData?.access_token) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Twitter auth is invalid for this user.');
      }

      const user = await this.getUserFromAccessToken(authData.access_token, authData);

      if (user.id !== authData.id) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Twitter auth is invalid for this user.');
      }

      return;
    }

    if (!authData?.code) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Twitter code is required.');
    }

    const access_token = await this.exchangeAccessToken(authData);
    const user = await this.getUserFromAccessToken(access_token, authData);


    authData.access_token = access_token;
    authData.id = user.id;

    delete authData.code;
    delete authData.redirect_uri;
  }

  validateAppId() {
    return Promise.resolve();
  }
}

export default new TwitterAuthAdapter();
