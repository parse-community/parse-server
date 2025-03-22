/**
 * Parse Server authentication adapter for Instagram.
 *
 * @class InstagramAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Instagram App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your Instagram App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Instagram authentication, use the following structure:
 * ```json
 * {
 *   "auth": {
 *     "instagram": {
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
 *     "instagram": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `code`, `redirect_uri`.
 * - **Insecure Authentication (Deprecated)**: `id`, `access_token`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "instagram": {
 *     "code": "lmn789opq012rst345uvw",
 *     "redirect_uri": "https://example.com/callback"
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Deprecated)
 * ```json
 * {
 *   "instagram": {
 *     "id": "1234567",
 *     "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `enableInsecureAuth` is **deprecated** and will be removed in future versions. Use secure authentication with `code` and `redirect_uri`.
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using Instagram's OAuth flow.
 *
 * @see {@link https://developers.facebook.com/docs/instagram-basic-display-api/getting-started Instagram Basic Display API - Getting Started}
 */


import BaseAuthCodeAdapter from './BaseCodeAuthAdapter';
class InstagramAdapter extends BaseAuthCodeAdapter {
  constructor() {
    super('Instagram');
  }

  async getAccessTokenFromCode(authData) {
    const response = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code: authData.code
      })
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram API request failed.');
    }

    const data = await response.json();
    if (data.error) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, data.error_description || data.error);
    }

    return data.access_token;
  }

  async getUserFromAccessToken(accessToken, authData) {
    const defaultURL = 'https://graph.instagram.com/';
    const apiURL = authData.apiURL || defaultURL;
    const path = `${apiURL}me?fields=id&access_token=${accessToken}`;

    const response = await fetch(path);

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram API request failed.');
    }

    const user = await response.json();
    if (user?.id !== authData.id) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram auth is invalid for this user.');
    }

    return {
      id: user.id,
    }

  }
}

export default new InstagramAdapter();
