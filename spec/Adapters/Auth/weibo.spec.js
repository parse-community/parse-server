const WeiboAdapter = require('../../../lib/Adapters/Auth/weibo').default;

describe('WeiboAdapter', function () {
  let adapter;

  beforeEach(function () {
    adapter = new WeiboAdapter.constructor();
  });

  describe('Test configuration errors', function () {
    it('should throw error if code or redirect_uri is missing', async function () {
      const invalidAuthData = [
        {},
        { code: 'validCode' },
        { redirect_uri: 'http://example.com/callback' },
      ];

      for (const authData of invalidAuthData) {
        await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWith(
          jasmine.objectContaining({
            message: 'Weibo auth requires code and redirect_uri to be sent.',
          })
        );
      }
    });
  });

  describe('Test getUserFromAccessToken', function () {
    it('should fetch user successfully', async function () {
      mockFetch([
        {
          url: 'https://api.weibo.com/oauth2/get_token_info',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ uid: 'validUserId' }),
          },
        },
      ]);

      const authData = { id: 'validUserId' };
      const user = await adapter.getUserFromAccessToken('validToken', authData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.weibo.com/oauth2/get_token_info',
        jasmine.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
      expect(user).toEqual({ id: 'validUserId' });
    });

    it('should throw error for invalid response', async function () {
      mockFetch([
        {
          url: 'https://api.weibo.com/oauth2/get_token_info',
          method: 'POST',
          response: {
            ok: false,
            json: () => Promise.resolve({}),
          },
        },
      ]);

      const authData = { id: 'invalidUserId' };
      await expectAsync(adapter.getUserFromAccessToken('invalidToken', authData)).toBeRejectedWith(
        jasmine.objectContaining({
          message: 'Weibo auth is invalid for this user.',
        })
      );
    });
  });

  describe('Test getAccessTokenFromCode', function () {
    it('should fetch access token successfully', async function () {
      mockFetch([
        {
          url: 'https://api.weibo.com/oauth2/access_token',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validToken', uid: 'validUserId' }),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'http://example.com/callback' };
      const token = await adapter.getAccessTokenFromCode(authData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.weibo.com/oauth2/access_token',
        jasmine.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
      expect(token).toEqual('validToken');
    });

    it('should throw error for invalid response', async function () {
      mockFetch([
        {
          url: 'https://api.weibo.com/oauth2/access_token',
          method: 'POST',
          response: {
            ok: false,
            json: () => Promise.resolve({ errcode: 40029 }),
          },
        },
      ]);

      const authData = { code: 'invalidCode', redirect_uri: 'http://example.com/callback' };
      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWith(
        jasmine.objectContaining({
          message: 'Weibo auth is invalid for this user.',
        })
      );
    });
  });

  describe('WeiboAdapter E2E Tests', function () {
    beforeEach(async () => {
      await reconfigureServer({
        auth: {
          weibo: {
            clientId: 'validAppId',
            clientSecret: 'validAppSecret',
          },
        }
      });
    });

    it('should authenticate user successfully using WeiboAdapter', async function () {
      mockFetch([
        {
          url: 'https://api.weibo.com/oauth2/access_token',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validAccessToken', uid: 'user123' }),
          },
        },
        {
          url: 'https://api.weibo.com/oauth2/get_token_info',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ uid: 'user123' }),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'http://example.com/callback' };
      const user = await Parse.User.logInWith('weibo', { authData });

      expect(user.id).toBeDefined();
    });

    it('should handle invalid code error gracefully', async function () {
      mockFetch([
        {
          url: 'https://api.weibo.com/oauth2/access_token',
          method: 'POST',
          response: {
            ok: false,
            json: () => Promise.resolve({ errcode: 40029 }),
          },
        },
      ]);

      const authData = { code: 'invalidCode', redirect_uri: 'http://example.com/callback' };
      await expectAsync(Parse.User.logInWith('weibo', { authData })).toBeRejectedWith(
        jasmine.objectContaining({ message: 'Weibo auth is invalid for this user.' })
      );
    });

    it('should handle error when fetching user data fails', async function () {
      mockFetch([
        {
          url: 'https://api.weibo.com/oauth2/access_token',
          method: 'POST',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validAccessToken', uid: 'user123' }),
          },
        },
        {
          url: 'https://api.weibo.com/oauth2/get_token_info',
          method: 'POST',
          response: {
            ok: false,
            json: () => Promise.resolve({}),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'http://example.com/callback' };
      await expectAsync(Parse.User.logInWith('weibo', { authData })).toBeRejectedWith(
        jasmine.objectContaining({ message: 'Weibo auth is invalid for this user.' })
      );
    });
  });
});
