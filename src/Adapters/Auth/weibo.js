/**
 * Parse Server authentication adapter for Weibo.
 *
 * @class WeiboAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 * @param {string} options.clientId - Your Weibo client ID.
 * @param {string} options.clientSecret - Your Weibo client secret.
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Weibo authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "weibo": {
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
 *     "weibo": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `code`, `redirect_uri`.
 * - **Insecure Authentication (Not Recommended)**: `id`, `access_token`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "weibo": {
 *     "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 *     "redirect_uri": "https://example.com/callback"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "weibo": {
 *     "id": "1234567",
 *     "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - **Insecure Authentication**: When `enableInsecureAuth` is enabled, the adapter directly validates the `id` and `access_token` provided by the client.
 * - **Secure Authentication**: When `enableInsecureAuth` is disabled, the adapter exchanges the `code` and `redirect_uri` for an access token using Weibo's OAuth API.
 * - `enableInsecureAuth` is **deprecated** and may be removed in future versions. Use secure authentication with `code` and `redirect_uri`.
 *
 * @example <caption>Auth Data Example (Secure)</caption>
 * const authData = {
 *   weibo: {
 *     code: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 *     redirect_uri: "https://example.com/callback"
 *   }
 * };
 *
 * @example <caption>Auth Data Example (Insecure - Not Recommended)</caption>
 * const authData = {
 *   weibo: {
 *     id: "1234567",
 *     access_token: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * };
 *
 * @see {@link https://open.weibo.com/wiki/Oauth2/access_token Weibo Authentication Documentation}
 */

import BaseAuthCodeAdapter from './BaseCodeAuthAdapter';
import querystring from 'querystring';

class WeiboAdapter extends BaseAuthCodeAdapter {
  constructor() {
    super('Weibo');
  }

  async getUserFromAccessToken(access_token) {
    const postData = querystring.stringify({
      access_token: access_token,
    });

    const response = await fetch('https://api.weibo.com/oauth2/get_token_info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Weibo auth is invalid for this user.');
    }

    return {
      id: data.uid,
    }
  }

  async getAccessTokenFromCode(authData) {
    if (!authData?.code || !authData?.redirect_uri) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Weibo auth requires code and redirect_uri to be sent.'
      );
    }

    const postData = querystring.stringify({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code: authData.code,
      redirect_uri: authData.redirect_uri,
    });

    const response = await fetch('https://api.weibo.com/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
    });

    const data = await response.json();

    if (!response.ok || data.errcode) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Weibo auth is invalid for this user.');
    }

    return data.access_token;
  }
}

export default new WeiboAdapter();
