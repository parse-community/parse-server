const LineAdapter = require('../../../lib/Adapters/Auth/line').default;
describe('LineAdapter', function () {
  let adapter;

  beforeEach(function () {
    adapter = new LineAdapter.constructor();
    adapter.clientId = 'validClientId';
    adapter.clientSecret = 'validClientSecret';
  });

  describe('getAccessTokenFromCode', function () {
    it('should throw an error if code is missing in authData', async function () {
      const authData = { redirect_uri: 'http://example.com' };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Line auth is invalid for this user.'
      );
    });

    it('should fetch an access token successfully', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'mockAccessToken',
              }),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'http://example.com',
      };

      const token = await adapter.getAccessTokenFromCode(authData);

      expect(token).toBe('mockAccessToken');
    });

    it('should throw an error if response is not ok', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Bad Request',
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Failed to exchange code for token: Bad Request'
      );
    });

    it('should throw an error if response contains an error object', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                error: 'invalid_grant',
                error_description: 'Code is invalid',
              }),
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Code is invalid'
      );
    });
  });

  describe('getUserFromAccessToken', function () {
    it('should fetch user data successfully', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                userId: 'mockUserId',
                displayName: 'mockDisplayName',
              }),
          },
        },
      ]);

      const accessToken = 'validAccessToken';
      const user = await adapter.getUserFromAccessToken(accessToken);

      expect(user).toEqual({
        userId: 'mockUserId',
        displayName: 'mockDisplayName',
      });
    });

    it('should throw an error if response is not ok', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const accessToken = 'invalidAccessToken';

      await expectAsync(adapter.getUserFromAccessToken(accessToken)).toBeRejectedWithError(
        'Failed to fetch Line user: Unauthorized'
      );
    });

    it('should throw an error if user data is invalid', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({}),
          },
        },
      ]);

      const accessToken = 'validAccessToken';

      await expectAsync(adapter.getUserFromAccessToken(accessToken)).toBeRejectedWithError(
        'Invalid Line user data received.'
      );
    });
  });

  describe('LineAdapter E2E Test', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          line: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
          },
        },
      });
    });

    it('should log in user successfully with valid code', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'mockAccessToken123',
              }),
          },
        },
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                userId: 'mockUserId',
                displayName: 'mockDisplayName',
              }),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'http://example.com',
      };

      const user = await Parse.User.logInWith('line', { authData });

      expect(user.id).toBeDefined();
    });

    it('should handle error when token exchange fails', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Invalid code',
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('line', { authData })).toBeRejectedWithError(
        'Failed to exchange code for token: Invalid code'
      );
    });

    it('should handle error when user data fetch fails', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'mockAccessToken123',
              }),
          },
        },
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('line', { authData })).toBeRejectedWithError(
        'Failed to fetch Line user: Unauthorized'
      );
    });

    it('should handle error when user data is invalid', async function () {
      mockFetch([
        {
          url: 'https://api.line.me/oauth2/v2.1/token',
          method: 'POST',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'mockAccessToken123',
              }),
          },
        },
        {
          url: 'https://api.line.me/v2/profile',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({}),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        redirect_uri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('line', { authData })).toBeRejectedWithError(
        'Invalid Line user data received.'
      );
    });

    it('should handle error when no code is provided', async function () {
      mockFetch();

      const authData = {
        redirect_uri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('line', { authData })).toBeRejectedWithError(
        'Line code is required.'
      );
    });
  });

});
