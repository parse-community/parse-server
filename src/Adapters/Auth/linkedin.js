/**
 * Parse Server authentication adapter for LinkedIn.
 *
 * @class LinkedInAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your LinkedIn App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your LinkedIn App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for LinkedIn authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "linkedin": {
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
 *     "linkedin": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `code`, `redirect_uri`, and optionally `is_mobile_sdk`.
 * - **Insecure Authentication (Not Recommended)**: `id`, `access_token`, and optionally `is_mobile_sdk`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "linkedin": {
 *     "code": "lmn789opq012rst345uvw",
 *     "redirect_uri": "https://your-redirect-uri.com/callback",
 *     "is_mobile_sdk": true
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "linkedin": {
 *     "id": "7654321",
 *     "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc",
 *     "is_mobile_sdk": true
 *   }
 * }
 * ```
 *
 * ## Notes
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using LinkedIn's OAuth API.
 * - Insecure authentication validates the user ID and access token directly, bypassing OAuth flows. This method is **not recommended** and may introduce security vulnerabilities.
 * - `enableInsecureAuth` is **deprecated** and may be removed in future versions.
 *
 * @see {@link https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication LinkedIn Authentication Documentation}
 */

import BaseAuthCodeAdapter from './BaseCodeAuthAdapter';
class LinkedInAdapter extends BaseAuthCodeAdapter {
  constructor() {
    super('LinkedIn');
  }
  async getUserFromAccessToken(access_token, authData) {
    const response = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'x-li-format': 'json',
        'x-li-src': authData?.is_mobile_sdk ? 'msdk' : undefined,
      },
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'LinkedIn API request failed.');
    }

    return response.json();
  }

  async getAccessTokenFromCode(authData) {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authData.code,
        redirect_uri: authData.redirect_uri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'LinkedIn API request failed.');
    }

    const json = await response.json();
    return json.access_token;
  }
}

export default new LinkedInAdapter();
