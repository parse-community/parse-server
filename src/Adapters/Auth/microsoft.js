/**
 * Parse Server authentication adapter for Microsoft.
 *
 * @class MicrosoftAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Microsoft App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your Microsoft App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Microsoft authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "microsoft": {
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
 *     "microsoft": {
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
 *   "microsoft": {
 *     "code": "lmn789opq012rst345uvw",
 *     "redirect_uri": "https://your-redirect-uri.com/callback"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "microsoft": {
 *     "id": "7654321",
 *     "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using Microsoft's OAuth API.
 * - **Insecure authentication** validates the user ID and access token directly, bypassing OAuth flows (not recommended). This method is deprecated and may be removed in future versions.
 *
 * @see {@link https://docs.microsoft.com/en-us/graph/auth/auth-concepts Microsoft Authentication Documentation}
 */

import BaseAuthCodeAdapter from './BaseCodeAuthAdapter';
class MicrosoftAdapter extends BaseAuthCodeAdapter {
  constructor() {
    super('Microsoft');
  }
  async getUserFromAccessToken(access_token) {
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: 'Bearer ' + access_token,
      },
    });

    if (!userResponse.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Microsoft API request failed.');
    }

    return userResponse.json();
  }

  async getAccessTokenFromCode(authData) {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
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
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Microsoft API request failed.');
    }

    const json = await response.json();
    return json.access_token;
  }
}

export default new MicrosoftAdapter();
