/**
 * Parse Server authentication adapter for Spotify.
 *
 * @class SpotifyAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Spotify application's Client ID. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Spotify authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "spotify": {
 *       "clientId": "your-client-id"
 *     }
 *   }
 * }
 * ```
 * ### Insecure Configuration (Not Recommended)
 * ```json
 * {
 *   "auth": {
 *     "spotify": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `code`, `redirect_uri`, and `code_verifier`.
 * - **Insecure Authentication (Not Recommended)**: `id`, `access_token`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "spotify": {
 *     "code": "abc123def456ghi789",
 *     "redirect_uri": "https://example.com/callback",
 *     "code_verifier": "secure-code-verifier"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "spotify": {
 *     "id": "1234567",
 *     "access_token": "abc123def456ghi789"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `enableInsecureAuth` is **not recommended** and bypasses secure flows by validating the user ID and access token directly. This method is not suitable for production environments and may be removed in future versions.
 * - Secure authentication exchanges the `code` provided by the client for an access token using Spotify's OAuth API. This method ensures greater security and is the recommended approach.
 *
 * @see {@link https://developer.spotify.com/documentation/web-api/tutorials/getting-started Spotify OAuth Documentation}
 */

import BaseAuthCodeAdapter from './BaseCodeAuthAdapter';
class SpotifyAdapter extends BaseAuthCodeAdapter {
  constructor() {
    super('spotify');
  }

  async getUserFromAccessToken(access_token) {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: 'Bearer ' + access_token,
      },
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify API request failed.');
    }

    const user = await response.json();
    return {
      id: user.id,
    };
  }

  async getAccessTokenFromCode(authData) {
    if (!authData.code || !authData.redirect_uri || !authData.code_verifier) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Spotify auth configuration authData.code and/or authData.redirect_uri and/or authData.code_verifier.'
      );
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authData.code,
        redirect_uri: authData.redirect_uri,
        code_verifier: authData.code_verifier,
        client_id: this.clientId,
      }),
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify API request failed.');
    }

    return response.json();
  }
}

export default new SpotifyAdapter();
