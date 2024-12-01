const InstagramAdapter = require('../../../lib/Adapters/Auth/instagram').default;

describe('InstagramAdapter', function () {
  let adapter;

  beforeEach(function () {
    adapter = new InstagramAdapter.constructor();
    adapter.clientId = 'validClientId';
    adapter.clientSecret = 'validClientSecret';
    adapter.redirectUri = 'https://example.com/callback';
  });

  describe('getAccessTokenFromCode', function () {
    it('should fetch an access token successfully', async function () {
      mockFetch([
        {
          url: 'https://api.instagram.com/oauth/access_token',
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

      const authData = { code: 'validCode' };
      const token = await adapter.getAccessTokenFromCode(authData);

      expect(token).toBe('mockAccessToken');
    });

    it('should throw an error if the response contains an error', async function () {
      mockFetch([
        {
          url: 'https://api.instagram.com/oauth/access_token',
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

      const authData = { code: 'invalidCode' };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWithError(
        'Code is invalid'
      );
    });
  });

  describe('getUserFromAccessToken', function () {
    it('should fetch user data successfully', async function () {
      mockFetch([
        {
          url: 'https://graph.instagram.com/me?fields=id&access_token=mockAccessToken',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'mockUserId',
              }),
          },
        },
      ]);

      const accessToken = 'mockAccessToken';
      const authData = { id: 'mockUserId' };
      const user = await adapter.getUserFromAccessToken(accessToken, authData);

      expect(user).toEqual({ id: 'mockUserId' });
    });

    it('should throw an error if user ID does not match authData', async function () {
      mockFetch([
        {
          url: 'https://graph.instagram.com/me?fields=id&access_token=mockAccessToken',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'differentUserId',
              }),
          },
        },
      ]);

      const accessToken = 'mockAccessToken';
      const authData = { id: 'mockUserId' };

      await expectAsync(adapter.getUserFromAccessToken(accessToken, authData)).toBeRejectedWithError(
        'Instagram auth is invalid for this user.'
      );
    });
  });

  describe('InstagramAdapter E2E Test', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          instagram: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
            redirectUri: 'https://example.com/callback',
          },
        },
      });
    });

    it('should log in user successfully with valid code', async function () {
      mockFetch([
        {
          url: 'https://api.instagram.com/oauth/access_token',
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
          url: 'https://graph.instagram.com/me?fields=id&access_token=mockAccessToken123',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'mockUserId',
              }),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        id: 'mockUserId',
      };

      const user = await Parse.User.logInWith('instagram', { authData });

      expect(user.id).toBeDefined();
    });

    it('should handle error when access token exchange fails', async function () {
      mockFetch([
        {
          url: 'https://api.instagram.com/oauth/access_token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Invalid code',
          },
        },
      ]);

      const authData = {
        code: 'invalidCode',
      };

      await expectAsync(Parse.User.logInWith('instagram', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram API request failed.')
      );
    });

    it('should handle error when user data fetch fails', async function () {
      mockFetch([
        {
          url: 'https://api.instagram.com/oauth/access_token',
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
          url: 'https://graph.instagram.com/me?fields=id&access_token=mockAccessToken123',
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
      };

      await expectAsync(Parse.User.logInWith('instagram', { authData })).toBeRejectedWith(
        new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram API request failed.')
      );
    });

    it('should handle error when user data is invalid', async function () {
      mockFetch([
        {
          url: 'https://api.instagram.com/oauth/access_token',
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
          url: 'https://graph.instagram.com/me?fields=id&access_token=mockAccessToken123',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'differentUserId',
              }),
          },
        },
      ]);

      const authData = {
        code: 'validCode',
        id: 'mockUserId',
      };

      await expectAsync(Parse.User.logInWith('instagram', { authData })).toBeRejectedWithError(
        'Instagram auth is invalid for this user.'
      );
    });

    it('should handle error when no code or access token is provided', async function () {
      mockFetch();

      const authData = {
        id: 'mockUserId',
      };

      await expectAsync(Parse.User.logInWith('instagram', { authData })).toBeRejectedWithError(
        'Instagram code is required.'
      );
    });
  });

});
