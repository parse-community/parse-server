/**
 * Parse Server authentication adapter for Google Play Games Services.
 *
 * @class GooglePlayGamesServicesAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Google Play Games Services App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your Google Play Games Services App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Google Play Games Services authentication, use the following structure:
 * ```json
 * {
 *   "auth": {
 *     "gpgames": {
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
 *     "gpgames": {
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
 *   "gpgames": {
 *     "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 *     "redirect_uri": "https://example.com/callback"
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "gpgames": {
 *     "id": "123456789",
 *     "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `enableInsecureAuth` is **not recommended** and may be removed in future versions. Use secure authentication with `code` and `redirect_uri`.
 * - Secure authentication exchanges the `code` provided by the client for an access token using Google Play Games Services' OAuth API.
 *
 * @see {@link https://developers.google.com/games/services/console/enabling Google Play Games Services Authentication Documentation}
 */

import BaseCodeAuthAdapter from './BaseCodeAuthAdapter';
class GooglePlayGamesServicesAdapter extends BaseCodeAuthAdapter {
  constructor() {
    super("gpgames");
  }

  async getAccessTokenFromCode(authData) {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: authData.code,
        redirect_uri: authData.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new Parse.Error(
        Parse.Error.VALIDATION_ERROR,
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

  async getUserFromAccessToken(accessToken, authData) {
    const userApiUrl = `https://www.googleapis.com/games/v1/players/${authData.id}`;
    const response = await fetch(userApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Parse.Error(
        Parse.Error.VALIDATION_ERROR,
        `Failed to fetch Google Play Games Services user: ${response.statusText}`
      );
    }

    const userData = await response.json();
    if (!userData.playerId || userData.playerId !== authData.id) {
      throw new Parse.Error(
        Parse.Error.VALIDATION_ERROR,
        'Invalid Google Play Games Services user data received.'
      );
    }

    return {
      id: userData.playerId
    };
  }

}

export default new GooglePlayGamesServicesAdapter();
