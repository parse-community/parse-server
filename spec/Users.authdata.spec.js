describe('AuthData Delta Behavior', () => {
  const MOCK_USER_ID = 'mockUserId';
  const MOCK_ACCESS_TOKEN = 'mockAccessToken123';

  const createMockUser = () => ({
    id: MOCK_USER_ID,
    code: 'C1'
  });

  const mockGooglePlayGamesAPI = () => {
    mockFetch([
      {
        url: 'https://oauth2.googleapis.com/token',
        method: 'POST',
        response: {
          ok: true,
          json: () => Promise.resolve({ access_token: MOCK_ACCESS_TOKEN }),
        },
      },
      {
        url: `https://www.googleapis.com/games/v1/players/${MOCK_USER_ID}`,
        method: 'GET',
        response: {
          ok: true,
          json: () => Promise.resolve({ playerId: MOCK_USER_ID }),
        },
      },
    ]);
  };

  const setupAuthConfig = (additionalProviders = {}) => {
    return reconfigureServer({
      auth: {
        gpgames: {
          clientId: 'validClientId',
          clientSecret: 'validClientSecret',
        },
        someAdapter1: {
          validateAuthData: () => Promise.resolve(),
          validateAppId: () => Promise.resolve(),
          validateOptions: () => {},
        },
        someAdapter2: {
          validateAuthData: () => Promise.resolve(),
          validateAppId: () => Promise.resolve(),
          validateOptions: () => {},
        },
        ...additionalProviders,
      },
    });
  };

  beforeEach(async () => {
    await setupAuthConfig();
  });

  describe('Provider Linking', () => {
    it('should link someAdapter1 without affecting unchanged Google Play Games auth', async () => {
      mockGooglePlayGamesAPI();

      const authData = createMockUser();
      const user = await Parse.User.logInWith('gpgames', { authData });
      const sessionToken = user.getSessionToken();

      await user.fetch({ sessionToken });
      const currentAuthData = user.get('authData') || {};

      user.set('authData', {
        ...currentAuthData,
        someAdapter1: { id: 'T1', access_token: 'token123' },
      });
      await user.save(null, { sessionToken });

      const updatedUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
      const finalAuthData = updatedUser.get('authData');

      expect(finalAuthData.gpgames?.id).toBe(MOCK_USER_ID);
      expect(finalAuthData.someAdapter1?.id).toBe('T1');
    });

    it('should handle multiple providers correctly', async () => {
      mockGooglePlayGamesAPI();

      const authData = {
        gpgames: { id: MOCK_USER_ID, code: 'C4' },
        someAdapter2: { id: 'F1', access_token: 'fb_token' },
      };

      const user = new Parse.User();
      user.set('authData', authData);
      await user.save();

      const sessionToken = user.getSessionToken();

      await user.fetch({ sessionToken });
      const currentAuthData = user.get('authData') || {};

      user.set('authData', {
        someAdapter2: currentAuthData.someAdapter2,
        someAdapter1: { id: 'T2', access_token: 'tw_token' },
        gpgames: null, // Unlink Google Play Games
      });
      await user.save(null, { sessionToken });

      const updatedUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
      const finalAuthData = updatedUser.get('authData') || {};

      expect(finalAuthData.gpgames).toBeUndefined();
      expect(finalAuthData.someAdapter2?.id).toBe('F1');
      expect(finalAuthData.someAdapter1?.id).toBe('T2');
    });
  });

  describe('Provider Unlinking', () => {
    it('should unlink provider via null', async () => {
      mockGooglePlayGamesAPI();

      const authData = createMockUser();
      const user = await Parse.User.logInWith('gpgames', { authData });
      const sessionToken = user.getSessionToken();

      await user.fetch({ sessionToken });
      const currentAuthData = user.get('authData') || {};

      user.set('authData', {
        ...currentAuthData,
        gpgames: null,
      });
      await user.save(null, { sessionToken });

      const updatedUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
      const finalAuthData = updatedUser.get('authData') || {};

      expect(finalAuthData.gpgames).toBeUndefined();
    });
  });

  describe('Data Validation Optimization', () => {
    it('should skip revalidation when authData is identical', async () => {
      mockGooglePlayGamesAPI();

      const authData = createMockUser();
      const user = await Parse.User.logInWith('gpgames', { authData });
      const sessionToken = user.getSessionToken();

      await user.fetch({ sessionToken });
      const existingAuthData = user.get('authData');

      // Small delay to ensure timestamp differences don't affect comparison
      await new Promise(resolve => setTimeout(resolve, 100));

      user.set('authData', JSON.parse(JSON.stringify(existingAuthData)));
      await user.save(null, { sessionToken });

      const updatedUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
      const finalAuthData = updatedUser.get('authData') || {};

      expect(finalAuthData.gpgames?.id).toBe(MOCK_USER_ID);
    });

    it('should handle empty authData gracefully', async () => {
      mockGooglePlayGamesAPI();

      const user = await Parse.User.signUp('test', 'password123');

      const sessionToken = user.getSessionToken();
      await user.fetch({ sessionToken });

      user.set('authData', {
        someAdapter1: { id: 'T3', access_token: 'token456' },
      });
      await user.save(null, { sessionToken });

      const updatedUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
      const finalAuthData = updatedUser.get('authData');

      expect(finalAuthData).toBeDefined();
      expect(finalAuthData.someAdapter1?.id).toBe('T3');
    });
  });

  describe('Partial Data Updates', () => {
    it('should handle partial provider data updates correctly', async () => {
      mockGooglePlayGamesAPI()

      const authData = createMockUser();
      const user = await Parse.User.logInWith('gpgames', { authData });

      const sessionToken = user.getSessionToken();

      await user.fetch({ sessionToken });

      const currentAuthData = user.get('authData') || {};
      user.set('authData', {
        ...currentAuthData,
        gpgames: {
          ...currentAuthData.gpgames,
          code: 'new',
        },
      });
      await user.save(null, { sessionToken });

      const updatedUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
      const finalAuthData = updatedUser.get('authData');

      expect(finalAuthData.gpgames.id).toBe(MOCK_USER_ID);
    });
  });

  describe('API Call Optimization', () => {
    beforeEach(async () => {
      await setupAuthConfig();
    });

    it('should not call getAccessTokenFromCode for unchanged authData', async () => {
      mockGooglePlayGamesAPI();

      const authData = createMockUser();
      const user = await Parse.User.logInWith('gpgames', { authData });
      const sessionToken = user.getSessionToken();

      const initialCallCount = global.fetch.calls.count();

      const freshUser = await new Parse.Query(Parse.User).get(user.id, { sessionToken });
      const currentAuthData = freshUser.get('authData');

      freshUser.set('authData', JSON.parse(JSON.stringify(currentAuthData)));
      await freshUser.save(null, { sessionToken });

      expect(global.fetch.calls.count()).toBe(initialCallCount);
    });

    it('should handle mixed authData operations without redundant API calls', async () => {
      mockGooglePlayGamesAPI();

      const authData = createMockUser();
      const user = await Parse.User.logInWith('gpgames', { authData });
      const sessionToken = user.getSessionToken();

      const initialCallCount = global.fetch.calls.count();

      const freshUser = await new Parse.Query(Parse.User).get(user.id, { sessionToken });
      const currentAuthData = freshUser.get('authData') || {};

      freshUser.set('authData', {
        ...currentAuthData,
        someAdapter2: { id: 'fb123', access_token: 'fb_token' }
      });
      await freshUser.save(null, { sessionToken });

      expect(global.fetch.calls.count()).toBe(initialCallCount);

      const finalUser = await new Parse.Query(Parse.User).get(user.id, { sessionToken });
      const finalAuthData = finalUser.get('authData') || {};

      expect(finalAuthData.gpgames?.id).toBe(MOCK_USER_ID);
      expect(finalAuthData.someAdapter2?.id).toBe('fb123');
    });
  });
});
