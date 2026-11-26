const WeChatAdapter = require('../../../lib/Adapters/Auth/wechat').default;

describe('WeChatAdapter', function () {
  let adapter;

  beforeEach(function () {
    adapter = new WeChatAdapter.constructor();
  });

  describe('Test getUserFromAccessToken', function () {
    it('should fetch user successfully', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/auth?access_token=validToken&openid=validOpenId',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ errcode: 0, id: 'validUserId' }),
          },
        },
      ]);

      const user = await adapter.getUserFromAccessToken('validToken', { id: 'validOpenId' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.weixin.qq.com/sns/auth?access_token=validToken&openid=validOpenId',
        jasmine.any(Object)
      );
      expect(user).toEqual({ errcode: 0, id: 'validUserId' });
    });

    it('should throw error for invalid response', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/auth?access_token=invalidToken&openid=undefined',
          method: 'GET',
          response: {
            ok: false,
            json: () => Promise.resolve({ errcode: 40013, errmsg: 'Invalid token' }),
          },
        },
      ]);

      await expectAsync(adapter.getUserFromAccessToken('invalidToken', 'invalidOpenId')).toBeRejectedWith(
        jasmine.objectContaining({ message: 'WeChat auth is invalid for this user.' })
      );
    });
  });

  describe('Test getAccessTokenFromCode', function () {
    it('should fetch access token successfully', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=validAppId&secret=validAppSecret&code=validCode&grant_type=authorization_code',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validToken', errcode: 0 }),
          },
        },
      ]);

      adapter.validateOptions({ clientId: 'validAppId', clientSecret: 'validAppSecret' });
      const authData = { code: 'validCode' };
      const token = await adapter.getAccessTokenFromCode(authData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.weixin.qq.com/sns/oauth2/access_token?appid=validAppId&secret=validAppSecret&code=validCode&grant_type=authorization_code',
        jasmine.any(Object)
      );
      expect(token).toEqual('validToken');
    });

    it('should throw error for invalid response', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=validAppId&secret=validAppSecret&code=invalidCode&grant_type=authorization_code',
          method: 'GET',
          response: {
            ok: false,
            json: () => Promise.resolve({ errcode: 40029, errmsg: 'Invalid code' }),
          },
        },
      ]);
      adapter.validateOptions({ clientId: 'validAppId', clientSecret: 'validAppSecret' });

      const authData = { code: 'invalidCode' };

      await expectAsync(adapter.getAccessTokenFromCode(authData)).toBeRejectedWith(
        jasmine.objectContaining({ message: 'WeChat auth is invalid for this user.' })
      );
    });
  });

  describe('WeChatAdapter E2E Tests', function () {
    beforeEach(async () => {
      await reconfigureServer({
        auth: {
          wechat: {
            clientId: 'validAppId',
            clientSecret: 'validAppSecret',
            enableInsecureAuth: false,
          },
        },
      });
    });

    it('should authenticate user successfully using WeChatAdapter', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=validAppId&secret=validAppSecret&code=validCode&grant_type=authorization_code',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validAccessToken', openid: 'user123', errcode: 0 }),
          },
        },
        {
          url: 'https://api.weixin.qq.com/sns/auth?access_token=validAccessToken&openid=user123',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ errcode: 0, id: 'user123' }),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'http://example.com/callback' };
      const user = await Parse.User.logInWith('wechat', { authData });

      expect(user.id).toBeDefined();
    });

    it('should handle invalid code error gracefully', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=validAppId&secret=validAppSecret&code=invalidCode&grant_type=authorization_code',
          method: 'GET',
          response: {
            ok: false,
            json: () => Promise.resolve({ errcode: 40029, errmsg: 'Invalid code' }),
          },
        },
      ]);

      const authData = { code: 'invalidCode', redirect_uri: 'http://example.com/callback' };

      await expectAsync(Parse.User.logInWith('wechat', { authData })).toBeRejectedWith(
        jasmine.objectContaining({ message: 'WeChat auth is invalid for this user.' })
      );
    });

    it('should handle error when fetching user data fails', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=validAppId&secret=validAppSecret&code=validCode&grant_type=authorization_code',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ access_token: 'validAccessToken', openid: 'user123', errcode: 0 }),
          },
        },
        {
          url: 'https://api.weixin.qq.com/sns/auth?access_token=validAccessToken&openid=user123',
          method: 'GET',
          response: {
            ok: false,
            json: () => Promise.resolve({ errcode: 40013, errmsg: 'Invalid token' }),
          },
        },
      ]);

      const authData = { code: 'validCode', redirect_uri: 'http://example.com/callback' };

      await expectAsync(Parse.User.logInWith('wechat', { authData })).toBeRejectedWith(
        jasmine.objectContaining({ message: 'WeChat auth is invalid for this user.' })
      );
    });

    it('should allow insecure auth when enabled', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/auth?access_token=validAccessToken&openid=user123',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ errcode: 0, id: 'user123' }),
          },
        },
      ]);

      await reconfigureServer({
        auth: {
          wechat: {
            appId: 'validAppId',
            appSecret: 'validAppSecret',
            enableInsecureAuth: true,
          },
        },
      });

      const authData = { access_token: 'validAccessToken', id: 'user123' };
      const user = await Parse.User.logInWith('wechat', { authData });

      expect(user.id).toBeDefined();
    });

    it('should reject insecure auth when user id does not match', async function () {
      mockFetch([
        {
          url: 'https://api.weixin.qq.com/sns/auth?access_token=validAccessToken&openid=incorrectUserId',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({ errcode: 0, id: 'incorrectUser' }),
          },
        },
      ]);

      await reconfigureServer({
        auth: {
          wechat: {
            appId: 'validAppId',
            appSecret: 'validAppSecret',
            enableInsecureAuth: true,
          },
        },
      });

      const authData = { access_token: 'validAccessToken', id: 'incorrectUserId' };
      await expectAsync(Parse.User.logInWith('wechat', { authData })).toBeRejectedWith(
        jasmine.objectContaining({ message: 'WeChat auth is invalid for this user.' })
      );
    });

    // Records the requests to WeChat and answers each with the JSON that `respond` returns
    function recordWeChatRequests(respond) {
      const requests = [];
      const fetch = global.fetch;
      spyOn(global, 'fetch').and.callFake((url, options) => {
        if (typeof url === 'string' && url.startsWith(Parse.serverURL)) {
          return fetch(url, options);
        }
        const requestUrl = new URL(url);
        requests.push(requestUrl);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(respond(requestUrl)) });
      });
      return requests;
    }

    it('should send the code as a single request parameter', async function () {
      const requests = recordWeChatRequests(url =>
        url.pathname === '/sns/oauth2/access_token'
          ? { access_token: 'validAccessToken', openid: 'user123', errcode: 0 }
          : { errcode: 0, id: 'user123' }
      );

      const authData = { code: 'code&appid=otherAppId#fragment' };
      await Parse.User.logInWith('wechat', { authData });

      expect(requests[0].pathname).toBe('/sns/oauth2/access_token');
      expect([...requests[0].searchParams]).toEqual([
        ['appid', 'validAppId'],
        ['secret', 'validAppSecret'],
        ['code', 'code&appid=otherAppId#fragment'],
        ['grant_type', 'authorization_code'],
      ]);
      expect(requests[0].hash).toBe('');
    });

    it('should send the access token as a single request parameter with insecure auth', async function () {
      const requests = recordWeChatRequests(() => ({ errcode: 0, id: 'user123' }));

      await reconfigureServer({
        auth: {
          wechat: {
            appId: 'validAppId',
            appSecret: 'validAppSecret',
            enableInsecureAuth: true,
          },
        },
      });

      const authData = { access_token: 'token&openid=otherUser#fragment', id: 'user123' };
      await Parse.User.logInWith('wechat', { authData });

      expect(requests.length).toBe(1);
      expect(requests[0].pathname).toBe('/sns/auth');
      expect([...requests[0].searchParams]).toEqual([
        ['access_token', 'token&openid=otherUser#fragment'],
        ['openid', 'user123'],
      ]);
      expect(requests[0].hash).toBe('');
    });

    it('should send the user id as a single request parameter with insecure auth', async function () {
      const requests = recordWeChatRequests(() => ({ errcode: 0, id: 'user123&openid=otherUser' }));

      await reconfigureServer({
        auth: {
          wechat: {
            appId: 'validAppId',
            appSecret: 'validAppSecret',
            enableInsecureAuth: true,
          },
        },
      });

      const authData = { access_token: 'validAccessToken', id: 'user123&openid=otherUser' };
      await Parse.User.logInWith('wechat', { authData });

      expect(requests.length).toBe(1);
      expect(requests[0].pathname).toBe('/sns/auth');
      expect([...requests[0].searchParams]).toEqual([
        ['access_token', 'validAccessToken'],
        ['openid', 'user123&openid=otherUser'],
      ]);
      expect(requests[0].hash).toBe('');
    });
  });
});
