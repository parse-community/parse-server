const GitHubAdapter = require('../../../lib/Adapters/Auth/github').default;

describe('GitHubAdapter', function () {
  let adapter;
  const validOptions = {
    clientId: 'validClientId',
    clientSecret: 'validClientSecret',
  };

  beforeEach(function () {
    adapter = new GitHubAdapter.constructor();
    adapter.validateOptions(validOptions);
  });

  describe('getAccessTokenFromCode', function () {
    it('should fetch an access token successfully', async function () {
      mockFetch([
        {
          url: 'https://github.com/login/oauth/access_token',
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
      const token = await adapter.getAccessTokenFromCode(code);

      expect(token).toBe('mockAccessToken');
    });

    it('should throw an error if the response is not ok', async function () {
      mockFetch([
        {
          url: 'https://github.com/login/oauth/access_token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Bad Request',
          },
        },
      ]);

      const code = 'invalidCode';

      await expectAsync(adapter.getAccessTokenFromCode(code)).toBeRejectedWithError(
        'Failed to exchange code for token: Bad Request'
      );
    });

    it('should throw an error if the response contains an error', async function () {
      mockFetch([
        {
          url: 'https://github.com/login/oauth/access_token',
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

      await expectAsync(adapter.getAccessTokenFromCode(code)).toBeRejectedWithError('Code is invalid');
    });
  });

  describe('getUserFromAccessToken', function () {
    it('should fetch user data successfully', async function () {
      mockFetch([
        {
          url: 'https://api.github.com/user',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'mockUserId',
                login: 'mockUserLogin',
              }),
          },
        },
      ]);

      const accessToken = 'validAccessToken';
      const user = await adapter.getUserFromAccessToken(accessToken);

      expect(user).toEqual({ id: 'mockUserId', login: 'mockUserLogin' });
    });

    it('should throw an error if the response is not ok', async function () {
      mockFetch([
        {
          url: 'https://api.github.com/user',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const accessToken = 'invalidAccessToken';

      await expectAsync(adapter.getUserFromAccessToken(accessToken)).toBeRejectedWithError(
        'Failed to fetch GitHub user: Unauthorized'
      );
    });

    it('should throw an error if user data is invalid', async function () {
      mockFetch([
        {
          url: 'https://api.github.com/user',
          method: 'GET',
          response: {
            ok: true,
            json: () => Promise.resolve({}),
          },
        },
      ]);

      const accessToken = 'validAccessToken';

      await expectAsync(adapter.getUserFromAccessToken(accessToken)).toBeRejectedWithError(
        'Invalid GitHub user data received.'
      );
    });
  });

  describe('GitHubAdapter E2E Test', function () {
    beforeEach(async function () {
      await reconfigureServer({
        auth: {
          github: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
          },
        },
      });
    });

    it('should log in user using GitHub adapter successfully', async function () {
      mockFetch([
        {
          url: 'https://github.com/login/oauth/access_token',
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
          url: 'https://api.github.com/user',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'mockUserId',
                login: 'mockUserLogin',
              }),
          },
        },
      ]);

      const authData = { code: 'validCode' };
      const user = await Parse.User.logInWith('github', { authData });

      expect(user.id).toBeDefined();
    });

    it('should handle error when GitHub returns invalid code', async function () {
      mockFetch([
        {
          url: 'https://github.com/login/oauth/access_token',
          method: 'POST',
          response: {
            ok: false,
            statusText: 'Invalid code',
          },
        },
      ]);

      const authData = { code: 'invalidCode' };

      await expectAsync(Parse.User.logInWith('github', { authData })).toBeRejectedWithError(
        'Failed to exchange code for token: Invalid code'
      );
    });

    it('should handle error when GitHub returns invalid user data', async function () {
      mockFetch([
        {
          url: 'https://github.com/login/oauth/access_token',
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
          url: 'https://api.github.com/user',
          method: 'GET',
          response: {
            ok: false,
            statusText: 'Unauthorized',
          },
        },
      ]);

      const authData = { code: 'validCode' };

      await expectAsync(Parse.User.logInWith('github', { authData })).toBeRejectedWithError(
        'Failed to fetch GitHub user: Unauthorized'
      );
    });

    it('e2e secure does not support insecure payload', async function () {
      mockFetch();
      const authData = { id: 'mockUserId', access_token: 'mockAccessToken123' };
      await expectAsync(Parse.User.logInWith('github', { authData })).toBeRejectedWithError(
        'GitHub code is required.'
      );
    });

    it('e2e insecure does support secure payload', async function () {
      await reconfigureServer({
        auth: {
          github: {
            clientId: 'validClientId',
            clientSecret: 'validClientSecret',
            enableInsecureAuth: true,
          },
        },
      });

      mockFetch([
        {
          url: 'https://github.com/login/oauth/access_token',
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
          url: 'https://api.github.com/user',
          method: 'GET',
          response: {
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'mockUserId',
                login: 'mockUserLogin',
              }),
          },
        },
      ]);

      const authData = { code: 'validCode' };
      const user = await Parse.User.logInWith('github', { authData });

      expect(user.id).toBeDefined();
    });
  });
});
