const GooglePlayGamesServicesAdapter = require('../../../lib/Adapters/Auth/gpgames').default;

describe('GooglePlayGamesServicesAdapter', function () {
  let adapter;

  beforeEach(function () {
    adapter = new GooglePlayGamesServicesAdapter.constructor();
    adapter.clientId = 'validClientId';
    adapter.clientSecret = 'validClientSecret';
  });

  describe('getAccessTokenFromCode', function () {
    it('should fetch an access token successfully', async function () {
      mockFetch([
        {
          url: 'https://oauth2.googleapis.com/token',
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

      const code = 'validCode';
      const authData = { redirectUri: 'http://example.com' };
      const token = await adapter.getAccessTokenFromCode(code, authData);

      expect(token).toBe('mockAccessToken');
    });

    it('should throw an error if the response is not ok', async function () {
      mockFetch([
        {
          url: 'https://oauth2.googleapis.com/token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Bad Request',
          },
        },
      ]);

      const code = 'invalidCode';
      const authData = { redirectUri: 'http://example.com' };

      await expectAsync(adapter.getAccessTokenFromCode(code, authData)).toBeRejectedWithError(
        'Failed to exchange code for token: Bad Request'
      );
    });

    it('should throw an error if the response contains an error', async function () {
      mockFetch([
        {
          url: 'https://oauth2.googleapis.com/token',
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

      const code = 'invalidCode';
      const authData = { redirectUri: 'http://example.com' };

      await expectAsync(adapter.getAccessTokenFromCode(code, authData)).toBeRejectedWithError(
        'Code is invalid'
      );
    });
  });

  describe('getUserFromAccessToken', function () {
    it('should fetch user data successfully', async function () {
      mockFetch([
        {
          url: 'https://www.googleapis.com/games/v1/players/mockUserId',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                playerId: 'mockUserId',
              }),
          },
        },
      ]);

      const accessToken = 'validAccessToken';
      const authData = { id: 'mockUserId' };
      const user = await adapter.getUserFromAccessToken(accessToken, authData);

      expect(user).toEqual({ id: 'mockUserId' });
    });

    it('should throw an error if the response is not ok', async function () {
      mockFetch([
        {
          url: 'https://www.googleapis.com/games/v1/players/mockUserId',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const accessToken = 'invalidAccessToken';
      const authData = { id: 'mockUserId' };

      await expectAsync(adapter.getUserFromAccessToken(accessToken, authData)).toBeRejectedWithError(
        'Failed to fetch Google Play Games Services user: Unauthorized'
      );
    });

    it('should throw an error if user data is invalid', async function () {
      mockFetch([
        {
          url: 'https://www.googleapis.com/games/v1/players/mockUserId',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({}),
          },
        },
      ]);

      const accessToken = 'validAccessToken';
      const authData = { id: 'mockUserId' };

      await expectAsync(adapter.getUserFromAccessToken(accessToken, authData)).toBeRejectedWithError(
        'Invalid Google Play Games Services user data received.'
      );
    });

    it('should throw an error if playerId does not match the provided user ID', async function () {
      mockFetch([
        {
          url: 'https://www.googleapis.com/games/v1/players/mockUserId',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                playerId: 'anotherUserId',
              }),
          },
        },
      ]);

      const accessToken = 'validAccessToken';
      const authData = { id: 'mockUserId' };

      await expectAsync(adapter.getUserFromAccessToken(accessToken, authData)).toBeRejectedWithError(
        'Invalid Google Play Games Services user data received.'
      );
    });
  });

  describe('GooglePlayGamesServicesAdapter E2E Test', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          gpgames: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
          },
        },
      });
    });

    it('should log in user successfully with valid code', async function () {
      mockFetch([
        {
          url: 'https://oauth2.googleapis.com/token',
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
          url: 'https://www.googleapis.com/games/v1/players/mockUserId',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                playerId: 'mockUserId',
              }),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        id: 'mockUserId',
        redirectUri: 'http://example.com',
      };

      const user = await Parse.User.logInWith('gpgames', { authData });

      expect(user.id).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        jasmine.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/games/v1/players/mockUserId',
        jasmine.any(Object)
      );
    });

    it('should handle error when the token exchange fails', async function () {
      mockFetch([
        {
          url: 'https://oauth2.googleapis.com/token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Invalid code',
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
        redirectUri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('gpgames', { authData })).toBeRejectedWithError(
        'Failed to exchange code for token: Invalid code'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        jasmine.any(Object)
      );
    });

    it('should handle error when user data fetch fails', async function () {
      mockFetch([
        {
          url: 'https://oauth2.googleapis.com/token',
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
          url: 'https://www.googleapis.com/games/v1/players/mockUserId',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        id: 'mockUserId',
        redirectUri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('gpgames', { authData })).toBeRejectedWithError(
        'Failed to fetch Google Play Games Services user: Unauthorized'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        jasmine.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/games/v1/players/mockUserId',
        jasmine.any(Object)
      );
    });

    it('should handle error when user data is invalid', async function () {
      mockFetch([
        {
          url: 'https://oauth2.googleapis.com/token',
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
          url: 'https://www.googleapis.com/games/v1/players/mockUserId',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                playerId: 'anotherUserId',
              }),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        id: 'mockUserId',
        redirectUri: 'http://example.com',
      };

      await expectAsync(Parse.User.logInWith('gpgames', { authData })).toBeRejectedWithError(
        'Invalid Google Play Games Services user data received.'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        jasmine.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/games/v1/players/mockUserId',
        jasmine.any(Object)
      );
    });

    it('should handle error when no code or access token is provided', async function () {
      mockFetch();

      const authData = {
        id: 'mockUserId',
      };

      await expectAsync(Parse.User.logInWith('gpgames', { authData })).toBeRejectedWithError(
        'gpgames code is required.'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

});

