/**
 * Parse Server authentication adapter for QQ.
 *
 * @class QqAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your QQ App ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your QQ App Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for QQ authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "qq": {
 *       "clientId": "your-app-id",
 *       "clientSecret": "your-app-secret"
 *     }
 *   }
 * }
 * ```
 * ### Insecure Configuration (Not Recommended)
 * ```json
 * {
 *   "auth": {
 *     "qq": {
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
 *   "qq": {
 *     "code": "abcd1234",
 *     "redirect_uri": "https://your-redirect-uri.com/callback"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "qq": {
 *     "id": "1234567",
 *     "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using QQ's OAuth API.
 * - **Insecure authentication** validates the `id` and `access_token` directly, bypassing OAuth flows. This approach is not recommended and may be deprecated in future versions.
 *
 * @see {@link https://wiki.connect.qq.com/ QQ Authentication Documentation}
 */

import BaseAuthCodeAdapter from './BaseCodeAuthAdapter';
class QqAdapter extends BaseAuthCodeAdapter {
  constructor() {
    super('qq');
  }

  async getUserFromAccessToken(access_token) {
    const response = await fetch('https://graph.qq.com/oauth2.0/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq API request failed.');
    }

    const data = await response.text();
    return this.parseResponseData(data);
  }

  async getAccessTokenFromCode(authData) {
    const response = await fetch('https://graph.qq.com/oauth2.0/token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: authData.redirect_uri,
        code: authData.code,
      }).toString(),
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq API request failed.');
    }

    const text = await response.text();
    const data = this.parseResponseData(text);
    return data.access_token;
  }
}

export default new QqAdapter();
