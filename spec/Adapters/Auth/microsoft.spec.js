const MicrosoftAdapter = require('../../../lib/Adapters/Auth/microsoft').default;

describe('MicrosoftAdapter', function () {
  let adapter;
  const validOptions = {
    clientId: 'validClientId',
    clientSecret: 'validClientSecret',
    enableInsecureAuth: false,
  };

  beforeEach(function () {
    adapter = new MicrosoftAdapter.constructor();
  });

  describe('Test configuration errors', function () {
    it('should throw error for missing options', function () {
      const invalidOptions = [null, undefined, {}, { clientId: 'validClientId' }];

      for (const options of invalidOptions) {
        expect(() => {
          adapter.validateOptions(options);
        }).toThrow();
      }
    });

    it('should validate options successfully with valid parameters', function () {
      expect(() => {
        adapter.validateOptions(validOptions);
      }).not.toThrow();
      expect(adapter.clientId).toBe(validOptions.clientId);
      expect(adapter.clientSecret).toBe(validOptions.clientSecret);
      expect(adapter.enableInsecureAuth).toBe(validOptions.enableInsecureAuth);
    });
  });

  describe('Test getUserFromAccessToken', function () {
    it('should fetch user successfully', async function () {
      mockFetch([
        {
          url: 'https://graph.microsoft.com/v1.0/me',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ id: 'validUserId' }),
          },
        },
      ]);

      const user = await adapter.getUserFromAccessToken('validToken');

      expect(global.fetch).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: 'Bearer validToken',
        },
        method: 'GET',
      });
      expect(user).toEqual({ id: 'validUserId' });
    });

    it('should throw error for invalid response', async function () {
      mockFetch([
        {
          url: 'https://graph.microsoft.com/v1.0/me',
          method: 'GET',
          response: { ok: false },
        },
      ]);

      await expectAsync(adapter.getUserFromAccessToken('invalidToken')).toBeRejectedWith(
        new Error('Microsoft API request failed.')
      );
    });
  });

  describe('Test getAccessTokenFromCode', function () {
    it('should fetch token successfully', async function () {
      mockFetch([
        {
          url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validToken' }),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'http://example.com' };
      const token = await adapter.getAccessTokenFromCode(authData);

      expect(global.fetch).toHaveBeenCalledWith('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: jasmine.any(URLSearchParams),
      });
      expect(token).toEqual('validToken');
    });

    it('should throw error for invalid response', async function () {
      mockFetch([
        {
          url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          method: 'POST',
          response: { ok: false },
        },
      ]);

      const authData = { code: 'invalidCode', redirect_uri: 'http://example.com' };
      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWith(
        new Error('Microsoft API request failed.')
      );
    });
  });

  describe('Test secure authentication flow', function () {
    it('should exchange code for access token and fetch user data', async function () {
      spyOn(adapter, 'getAccessTokenFromCode').and.returnValue(Promise.resolve('validToken'));
      spyOn(adapter, 'getUserFromAccessToken').and.returnValue(Promise.resolve({ id: 'validUserId' }));

      const authData = { code: 'validCode', redirect_uri: 'http://example.com' };
      await adapter.beforeFind(authData);

      expect(authData.access_token).toBe('validToken');
      expect(authData.id).toBe('validUserId');
    });

    it('should throw error if user data cannot be fetched', async function () {
      spyOn(adapter, 'getAccessTokenFromCode').and.returnValue(Promise.resolve('validToken'));
      spyOn(adapter, 'getUserFromAccessToken').and.throwError('Microsoft API request failed.');

      const authData = { code: 'validCode', redirect_uri: 'http://example.com' };
      await expectAsync(adapter.beforeFind(authData)).toBeRejectedWith(
        new Error('Microsoft API request failed.')
      );
    });
  });

  describe('Test insecure authentication flow', function () {
    beforeEach(function () {
      adapter.enableInsecureAuth = true;
    });

    it('should validate insecure auth and match user id', async function () {
      spyOn(adapter, 'getUserFromAccessToken').and.returnValue(
        Promise.resolve({ id: 'validUserId' })
      );

      const authData = { access_token: 'validToken', id: 'validUserId' };
      await expectAsync(adapter.beforeFind(authData)).toBeResolved();
    });

    it('should throw error if insecure auth user id does not match', async function () {
      spyOn(adapter, 'getUserFromAccessToken').and.returnValue(
        Promise.resolve({ id: 'invalidUserId' })
      );

      const authData = { access_token: 'validToken', id: 'validUserId' };
      await expectAsync(adapter.beforeFind(authData)).toBeRejectedWith(
        new Error('Microsoft auth is invalid for this user.')
      );
    });
  });

  describe('MicrosoftAdapter E2E Tests', () => {
    beforeEach(async () => {
      // Simulate reconfiguring the server with Microsoft auth options
      await reconfigureServer({
        auth: {
          microsoft: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
            enableInsecureAuth: false,
          },
        },
      });
    });

    it('should authenticate user successfully using MicrosoftAdapter', async () => {
      mockFetch([
        {
          url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validAccessToken' }),
          },
        },
        {
          url: 'https://graph.microsoft.com/v1.0/me',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ id: 'user123' }),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'http://example.com/callback' };
      const user = await Parse.User.logInWith('microsoft', { authData });

      expect(user.id).toBeDefined();
    });

    it('should handle invalid code error gracefully', async () => {
      mockFetch([
        {
          url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          method: 'POST',
          response: { ok: false, statusText: 'Invalid code' },
        },
      ]);

      const authData = { code: 'invalidCode', redirect_uri: 'http://example.com/callback' };

      await expectAsync(Parse.User.logInWith('microsoft', { authData })).toBeRejectedWithError(
        'Microsoft API request failed.'
      );
    });

    it('should handle error when fetching user data fails', async () => {
      mockFetch([
        {
          url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validAccessToken' }),
          },
        },
        {
          url: 'https://graph.microsoft.com/v1.0/me',
          method: 'GET',
          response: { ok: false, statusText: 'Unauthorized' },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'http://example.com/callback' };

      await expectAsync(Parse.User.logInWith('microsoft', { authData })).toBeRejectedWithError(
        'Microsoft API request failed.'
      );
    });

    it('should allow insecure auth when enabled', async () => {

      mockFetch([
        {
          url: 'https://graph.microsoft.com/v1.0/me',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({
              id: 'user123',
            }),
          },
        },
      ])

      await reconfigureServer({
        auth: {
          microsoft: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
            enableInsecureAuth: true,
          },
        },
      });

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      const user = await Parse.User.logInWith('microsoft', { authData });

      expect(user.id).toBeDefined();
    });

    it('should reject insecure auth when user id does not match', async () => {

      mockFetch([
        {
          url: 'https://graph.microsoft.com/v1.0/me',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({
              id: 'incorrectUser',
            }),
          },
        },
      ])

      await reconfigureServer({
        auth: {
          microsoft: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
            enableInsecureAuth: true,
          },
        },
      });

      const authData = { access_token: 'validAccessToken', id: 'incorrectUserId' };
      await expectAsync(Parse.User.logInWith('microsoft', { authData })).toBeRejectedWithError(
        'Microsoft auth is invalid for this user.'
      );
    });
  });

});
