
const LinkedInAdapter = require('../../../lib/Adapters/Auth/linkedin').default;
describe('LinkedInAdapter', function () {
  let adapter;
  const validOptions = {
    clientId: 'validClientId',
    clientSecret: 'validClientSecret',
    enableInsecureAuth: false,
  };

  beforeEach(function () {
    adapter = new LinkedInAdapter.constructor();
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

  describe('Test beforeFind', function () {
    it('should throw error for invalid payload', async function () {
      adapter.enableInsecureAuth = true;

      const payloads = [{}, { access_token: null }];

      for (const payload of payloads) {
        await expectAsync(adapter.beforeFind(payload)).toBeRejectedWith(
          new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'LinkedIn auth is invalid for this user.')
        );
      }
    });

    it('should process secure payload and set auth data', async function () {
      spyOn(adapter, 'getAccessTokenFromCode').and.returnValue(
        Promise.resolve('validToken')
      );
      spyOn(adapter, 'getUserFromAccessToken').and.returnValue(
        Promise.resolve({ id: 'validUserId' })
      );

      const authData = { code: 'validCode', redirect_uri: 'http://example.com', is_mobile_sdk: false };

      await adapter.beforeFind(authData);

      expect(authData.access_token).toBe('validToken');
      expect(authData.id).toBe('validUserId');
    });

    it('should validate insecure auth and match user id', async function () {
      adapter.enableInsecureAuth = true;
      spyOn(adapter, 'getUserFromAccessToken').and.returnValue(
        Promise.resolve({ id: 'validUserId' })
      );

      const authData = { access_token: 'validToken', id: 'validUserId', is_mobile_sdk: false };

      await expectAsync(adapter.beforeFind(authData)).toBeResolved();
    });

    it('should throw error if insecure auth user id does not match', async function () {
      adapter.enableInsecureAuth = true;
      spyOn(adapter, 'getUserFromAccessToken').and.returnValue(
        Promise.resolve({ id: 'invalidUserId' })
      );

      const authData = { access_token: 'validToken', id: 'validUserId', is_mobile_sdk: false };

      await expectAsync(adapter.beforeFind(authData)).toBeRejectedWith(
        new Error('LinkedIn auth is invalid for this user.')
      );
    });
  });

  describe('Test getUserFromAccessToken', function () {
    it('should fetch user successfully', async function () {
      global.fetch = jasmine.createSpy().and.returnValue(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'validUserId' }),
        })
      );

      const user = await adapter.getUserFromAccessToken('validToken', false);

      expect(global.fetch).toHaveBeenCalledWith('https://api.linkedin.com/v2/me', {
        headers: {
          Authorization: `Bearer validToken`,
          'x-li-format': 'json',
          'x-li-src': undefined,
        },
      });
      expect(user).toEqual({ id: 'validUserId' });
    });

    it('should throw error for invalid response', async function () {
      global.fetch = jasmine.createSpy().and.returnValue(
        Promise.resolve({ ok: false })
      );

      await expectAsync(adapter.getUserFromAccessToken('invalidToken', false)).toBeRejectedWith(
        new Error('LinkedIn API request failed.')
      );
    });
  });

  describe('Test getAccessTokenFromCode', function () {
    it('should fetch token successfully', async function () {
      global.fetch = jasmine.createSpy().and.returnValue(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'validToken' }),
        })
      );

      const tokenResponse = await adapter.getAccessTokenFromCode('validCode', 'http://example.com');

      expect(global.fetch).toHaveBeenCalledWith('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: jasmine.any(URLSearchParams),
      });
      expect(tokenResponse).toEqual('validToken');
    });

    it('should throw error for invalid response', async function () {
      global.fetch = jasmine.createSpy().and.returnValue(
        Promise.resolve({ ok: false })
      );

      await expectAsync(
        adapter.getAccessTokenFromCode('invalidCode', 'http://example.com')
      ).toBeRejectedWith(new Error('LinkedIn API request failed.'));
    });
  });

  describe('Test validate methods', function () {
    const authData = { id: 'validUserId', access_token: 'validToken' };

    it('validateLogin should return user id', function () {
      const result = adapter.validateLogin(authData);
      expect(result).toEqual({ id: 'validUserId' });
    });

    it('validateSetUp should return user id', function () {
      const result = adapter.validateSetUp(authData);
      expect(result).toEqual({ id: 'validUserId' });
    });

    it('validateUpdate should return user id', function () {
      const result = adapter.validateUpdate(authData);
      expect(result).toEqual({ id: 'validUserId' });
    });

    it('afterFind should return user id', function () {
      const result = adapter.afterFind(authData);
      expect(result).toEqual({ id: 'validUserId' });
    });
  });

  describe('LinkedInAdapter E2E Test', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          linkedin: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
          },
        },
      });
    });

    it('should log in user using LinkedIn adapter successfully (secure)', async function () {
      mockFetch([
        {
          url: 'https://www.linkedin.com/oauth/v2/accessToken',
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
          url: 'https://api.linkedin.com/v2/me',
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

      const authData = { code: 'validCode', redirect_uri: 'https://example.com/callback' };
      const user = await Parse.User.logInWith('linkedin', { authData });

      expect(user.id).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.linkedin.com/oauth/v2/accessToken',
        jasmine.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/me',
        jasmine.any(Object)
      );
    });

    it('should handle error when LinkedIn returns invalid user data', async function () {
      mockFetch([
        {
          url: 'https://www.linkedin.com/oauth/v2/accessToken',
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
          url: 'https://api.linkedin.com/v2/me',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'https://example.com/callback' };

      await expectAsync(Parse.User.logInWith('linkedin', { authData })).toBeRejectedWithError(
        'LinkedIn API request failed.'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.linkedin.com/oauth/v2/accessToken',
        jasmine.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/me',
        jasmine.any(Object)
      );
    });

    it('secure does not support insecure payload if not enabled', async function () {
      mockFetch();
      const authData = { id: 'mockUserId', access_token: 'mockAccessToken123' };
      await expectAsync(Parse.User.logInWith('linkedin', { authData })).toBeRejectedWithError(
        'LinkedIn code is required.'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('insecure mode supports insecure payload if enabled', async function () {
      await reconfigureServer({
        auth: {
          linkedin: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
            enableInsecureAuth: true,
          },
        },
      });

      mockFetch([
        {
          url: 'https://api.linkedin.com/v2/me',
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

      const authData = { id: 'mockUserId', access_token: 'mockAccessToken123' };
      const user = await Parse.User.logInWith('linkedin', { authData });

      expect(user.id).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/me',
        jasmine.any(Object)
      );
    });
  });
});
