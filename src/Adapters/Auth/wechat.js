/**
 * Parse Server authentication adapter for WeChat.
 *
 * @class WeChatAdapter
 * @param {Object} options - The adapter options object.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 * @param {string} options.clientId - Your WeChat App ID.
 * @param {string} options.clientSecret - Your WeChat App Secret.
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for WeChat authentication, use the following structure:
 * ### Secure Configuration (Recommended)
 * ```json
 * {
 *   "auth": {
 *     "wechat": {
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
 *     "wechat": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **With `enableInsecureAuth` (Not Recommended)**: `id`, `access_token`.
 * - **Without `enableInsecureAuth`**: `code`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload (Recommended)
 * ```json
 * {
 *   "wechat": {
 *     "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "wechat": {
 *     "id": "1234567",
 *     "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - With `enableInsecureAuth`, the adapter directly validates the `id` and `access_token` sent by the client.
 * - Without `enableInsecureAuth`, the adapter uses the `code` provided by the client to exchange for an access token via WeChat's OAuth API.
 * - The `enableInsecureAuth` flag is **deprecated** and may be removed in future versions. Use secure authentication with the `code` field instead.
 *
 * @example <caption>Auth Data Example</caption>
 * // Example authData provided by the client:
 * const authData = {
 *   wechat: {
 *     code: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * };
 *
 * @see {@link https://developers.weixin.qq.com/doc/offiaccount/en/OA_Web_Apps/Wechat_webpage_authorization.html WeChat Authentication Documentation}
 */

import BaseAuthCodeAdapter from './BaseCodeAuthAdapter';

class WeChatAdapter extends BaseAuthCodeAdapter {
  constructor() {
    super('WeChat');
  }

  async getUserFromAccessToken(access_token, authData) {
    const response = await fetch(
      `https://api.weixin.qq.com/sns/auth?access_token=${access_token}&openid=${authData.id}`
    );

    const data = await response.json();

    if (!response.ok || data.errcode !== 0) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'WeChat auth is invalid for this user.');
    }

    return data;
  }

  async getAccessTokenFromCode(authData) {
    if (!authData.code) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'WeChat auth requires a code to be sent.');
    }

    const appId = this.clientId;
    const appSecret = this.clientSecret


    const response = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${authData.code}&grant_type=authorization_code`
    );

    const data = await response.json();

    if (!response.ok || data.errcode) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'WeChat auth is invalid for this user.');
    }

    authData.id = data.openid;

    return data.access_token;
  }
}

export default new WeChatAdapter();
