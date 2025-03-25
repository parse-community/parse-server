const QqAdapter = require('../../../lib/Adapters/Auth/qq').default;

describe('QqAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new QqAdapter.constructor();
  });

  describe('getUserFromAccessToken', () => {
    it('should fetch user data successfully', async () => {
      const mockResponse = `callback({"client_id":"validAppId","openid":"user123"})`;

      mockFetch([
        {
          url: 'https://graph.qq.com/oauth2.0/me',
          method: 'GET',
          response: {
            ok: true,
            text: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      const result = await adapter.getUserFromAccessToken('validAccessToken');

      expect(result).toEqual({ client_id: 'validAppId', openid: 'user123' });
    });

    it('should throw an error if the API request fails', async () => {
      mockFetch([
        {
          url: 'https://graph.qq.com/oauth2.0/me',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      await expectAsync(
        adapter.getUserFromAccessToken('invalidAccessToken')
      ).toBeRejectedWithError('qq API request failed.');
    });
  });

  describe('getAccessTokenFromCode', () => {
    it('should fetch access token successfully', async () => {
      const mockResponse = `callback({"access_token":"validAccessToken","expires_in":3600,"refresh_token":"refreshToken"})`;

      mockFetch([
        {
          url: 'https://graph.qq.com/oauth2.0/token',
          method: 'GET',
          response: {
            ok: true,
            text: () => Promise.resolve(mockResponse),
          },
        },
      ]);

      const result = await adapter.getAccessTokenFromCode({
        code: 'validCode',
        redirect_uri: 'https://your-redirect-uri.com/callback',
      });

      expect(result).toBe('validAccessToken');
    });

    it('should throw an error if the API request fails', async () => {
      mockFetch([
        {
          url: 'https://graph.qq.com/oauth2.0/token',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Bad Request',
          },
        },
      ]);

      await expectAsync(
        adapter.getAccessTokenFromCode({
          code: 'invalidCode',
          redirect_uri: 'https://your-redirect-uri.com/callback',
        })
      ).toBeRejectedWithError('qq API request failed.');
    });
  });

  describe('parseResponseData', () => {
    it('should parse valid callback response data', () => {
      const response = `callback({"key":"value"})`;
      const result = adapter.parseResponseData(response);

      expect(result).toEqual({ key: 'value' });
    });

    it('should throw an error if the response data is invalid', () => {
      const response = 'invalid response';

      expect(() => adapter.parseResponseData(response)).toThrowError(
        'qq auth is invalid for this user.'
      );
    });
  });

  describe('QqAdapter E2E Test', () => {
    beforeEach(async () => {
      await reconfigureServer({
        auth: {
          qq: {
            clientId: 'validAppId',
            clientSecret: 'validAppSecret',
          },
        },
      });
    });

    it('should log in user using Qq adapter successfully', async () => {
      mockFetch([
        {
          url: 'https://graph.qq.com/oauth2.0/token',
          method: 'GET',
          response: {
            ok: true,
            text: () =>
              Promise.resolve(
                `callback({"access_token":"mockAccessToken","expires_in":3600})`
              ),
          },
        },
        {
          url: 'https://graph.qq.com/oauth2.0/me',
          method: 'GET',
          response: {
            ok: true,
            text: () =>
              Promise.resolve(
                `callback({"client_id":"validAppId","openid":"user123"})`
              ),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'https://your-redirect-uri.com/callback' };
      const user = await Parse.User.logInWith('qq', { authData });

      expect(user.id).toBeDefined();
    });

    it('should handle error when Qq returns invalid code', async () => {
      mockFetch([
        {
          url: 'https://graph.qq.com/oauth2.0/token',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Invalid code',
          },
        },
      ]);

      const authData = { code: 'invalidCode', redirect_uri: 'https://your-redirect-uri.com/callback' };

      await expectAsync(Parse.User.logInWith('qq', { authData })).toBeRejectedWithError(
        'qq API request failed.'
      );
    });

    it('should handle error when Qq returns invalid user data', async () => {
      mockFetch([
        {
          url: 'https://graph.qq.com/oauth2.0/token',
          method: 'GET',
          response: {
            ok: true,
            text: () =>
              Promise.resolve(
                `callback({"access_token":"mockAccessToken","expires_in":3600})`
              ),
          },
        },
        {
          url: 'https://graph.qq.com/oauth2.0/me',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'https://your-redirect-uri.com/callback' };

      await expectAsync(Parse.User.logInWith('qq', { authData })).toBeRejectedWithError(
        'qq API request failed.'
      );
    });

    it('e2e secure does not support insecure payload', async () => {
      mockFetch();
      const authData = { id: 'mockUserId', access_token: 'mockAccessToken' };
      await expectAsync(Parse.User.logInWith('qq', { authData })).toBeRejectedWithError(
        'qq code is required.'
      );
    });

    it('e2e insecure does support secure payload', async () => {
      await reconfigureServer({
        auth: {
          qq: {
            appId: 'validAppId',
            appSecret: 'validAppSecret',
            enableInsecureAuth: true,
          },
        },
      });

      mockFetch([
        {
          url: 'https://graph.qq.com/oauth2.0/token',
          method: 'GET',
          response: {
            ok: true,
            text: () =>
              Promise.resolve(
                `callback({"access_token":"mockAccessToken","expires_in":3600})`
              ),
          },
        },
        {
          url: 'https://graph.qq.com/oauth2.0/me',
          method: 'GET',
          response: {
            ok: true,
            text: () =>
              Promise.resolve(
                `callback({"client_id":"validAppId","openid":"user123"})`
              ),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'https://your-redirect-uri.com/callback' };
      const user = await Parse.User.logInWith('qq', { authData });

      expect(user.id).toBeDefined();
    });
  });
});
