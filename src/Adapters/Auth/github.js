/**
 * Parse Server authentication adapter for GitHub.
 * @class GitHubAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - The GitHub App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - The GitHub App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @param {Object} authData - The authentication data provided by the client.
 * @param {string} authData.code - The authorization code from GitHub. Required for secure authentication.
 * @param {string} [authData.id] - **[DEPRECATED]** The GitHub user ID (required for insecure authentication).
 * @param {string} [authData.access_token] - **[DEPRECATED]** The GitHub access token (required for insecure authentication).
 *
 * @description
 * ## Parse Server Configuration
 * * To configure Parse Server for GitHub authentication, use the following structure:
 * ```json
 * {
 *  "auth": {
 *   "github": {
 *     "clientId": "12345",
 *     "clientSecret": "abcde"
 *   }
 * }
 * ```
 *
 * The GitHub adapter exchanges the `authData.code` provided by the client for an access token using GitHub's OAuth API. The following `authData` field is required:
 * - `code`
 *
 * ## Insecure Authentication (Not Recommended)
 * Insecure authentication uses the `authData.id` and `authData.access_token` provided by the client. This flow is insecure, deprecated, and poses potential security risks. The following `authData` fields are required:
 * - `id` (**[DEPRECATED]**): The GitHub user ID.
 * - `access_token` (**[DEPRECATED]**): The GitHub access token.
 * To configure Parse Server for insecure authentication, use the following structure:
 * ```json
 * {
 *  "auth": {
 *    "github": {
 *    "enableInsecureAuth": true
 *  }
 * }
 * ```
 *
 * ### Deprecation Notice
 * The `enableInsecureAuth` option and insecure `authData` fields (`id`, `access_token`) are deprecated and will be removed in future versions. Use secure authentication with `clientId` and `clientSecret`.
 *
 * @example <caption>Secure Authentication Example</caption>
 * // Example authData for secure authentication:
 * const authData = {
 *   github: {
 *     code: "abc123def456ghi789"
 *   }
 * };
 *
 * @example <caption>Insecure Authentication Example (Not Recommended)</caption>
 * // Example authData for insecure authentication:
 * const authData = {
 *   github: {
 *     id: "1234567",
 *     access_token: "abc123def456ghi789" // Deprecated.
 *   }
 * };
 *
 * @note `enableInsecureAuth` will be removed in future versions. Use secure authentication with `clientId` and `clientSecret`.
 * @note Secure authentication exchanges the `code` provided by the client for an access token using GitHub's OAuth API.
 *
 * @see {@link https://docs.github.com/en/developers/apps/authorizing-oauth-apps GitHub OAuth Documentation}
 */

import BaseCodeAuthAdapter from './BaseCodeAuthAdapter';
class GitHubAdapter extends BaseCodeAuthAdapter {
  constructor() {
    super('GitHub');
  }
  async getAccessTokenFromCode(authData) {
    const tokenUrl = 'https://github.com/login/oauth/access_token';
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
      }),
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `Failed to exchange code for token: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, data.error_description || data.error);
    }

    return data.access_token;
  }

  async getUserFromAccessToken(accessToken) {
    const userApiUrl = 'https://api.github.com/user';
    const response = await fetch(userApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `Failed to fetch GitHub user: ${response.statusText}`);
    }

    const userData = await response.json();
    if (!userData.id || !userData.login) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Invalid GitHub user data received.');
    }

    return userData;
  }

}

export default new GitHubAdapter();

