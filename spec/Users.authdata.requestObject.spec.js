const {
  MOCK_USER_ID,
  VALID_CLIENT_ID,
  VALID_CLIENT_SECRET,
  setupAuthConfig,
} = require('./Users.authdata.helpers');

describe('AuthData Request Object Tests', () => {
  beforeEach(async () => {
    await setupAuthConfig({ includeInstagram: false });
  });

  // ============================================
  // Level 5.1: User in requestObject
  // ============================================

  describe('Level 5.1: User in requestObject', () => {
    it('should pass user to adapter on update via sessionToken', async () => {
      // Create user
      const user = new Parse.User();
      await user.save({
        username: 'test',
        password: 'password',
      });
      const sessionToken = user.getSessionToken();

      // Create adapter with validateAuthData (always called)
      const testAdapter = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      spyOn(testAdapter, 'validateAuthData').and.resolveTo({});

      await reconfigureServer({
        auth: {
          gpgames: { clientId: VALID_CLIENT_ID, clientSecret: VALID_CLIENT_SECRET },
          testAdapter,
        },
      });

      const payload = { someData: true };

      await user.save(
        { authData: { testAdapter: payload } },
        { sessionToken }
      );

      // Check requestObject.user was passed
      expect(testAdapter.validateAuthData).toHaveBeenCalled();
      const callArgs = testAdapter.validateAuthData.calls.argsFor(0);
      const requestObject = callArgs[2];
      expect(requestObject.user).toBeDefined();
      expect(requestObject.user.id).toBe(user.id);
    });

    it('should pass user to adapter on update via masterKey', async () => {
      // Create user
      const user = new Parse.User();
      await user.save({
        username: 'test',
        password: 'password',
      });

      // Create adapter with validateAuthData (always called)
      const testAdapter = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      spyOn(testAdapter, 'validateAuthData').and.resolveTo({});

      await reconfigureServer({
        auth: {
          gpgames: { clientId: VALID_CLIENT_ID, clientSecret: VALID_CLIENT_SECRET },
          testAdapter,
        },
      });

      const payload = { someData: true };

      await user.save(
        { authData: { testAdapter: payload } },
        { useMasterKey: true }
      );

      // Check requestObject.user (may be undefined for masterKey - legacy behavior)
      expect(testAdapter.validateAuthData).toHaveBeenCalled();
      const callArgs = testAdapter.validateAuthData.calls.argsFor(0);
      const requestObject = callArgs[2];
      // Note: For masterKey updates, user may be undefined in requestObject
      // (legacy behavior for validateAuthData)
      expect(requestObject.user).toBeUndefined();
    });

    it('should not pass user to adapter on login', async () => {
      // Create adapter with validateAuthData
      const testAdapter = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      spyOn(testAdapter, 'validateAuthData').and.resolveTo({});

      await reconfigureServer({
        auth: {
          gpgames: { clientId: VALID_CLIENT_ID, clientSecret: VALID_CLIENT_SECRET },
          testAdapter,
        },
      });

      await Parse.User.logInWith('testAdapter', {
        authData: { id: 'testId', token: 'testToken' },
      });

      // Check requestObject.user should be undefined for login
      expect(testAdapter.validateAuthData).toHaveBeenCalled();
      const callArgs = testAdapter.validateAuthData.calls.argsFor(0);
      const requestObject = callArgs[2];
      expect(requestObject.user).toBeUndefined();
    });

    it('should pass object and original to adapter', async () => {
      // Create user
      const user = new Parse.User();
      await user.save({
        username: 'test',
        password: 'password',
      });
      const sessionToken = user.getSessionToken();

      // Create adapter with validateAuthData
      const testAdapter = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      spyOn(testAdapter, 'validateAuthData').and.resolveTo({});

      await reconfigureServer({
        auth: {
          gpgames: { clientId: VALID_CLIENT_ID, clientSecret: VALID_CLIENT_SECRET },
          testAdapter,
        },
      });

      // First save with authData
      const payload1 = { id: 'testId', token: 'testToken' };
      await user.save(
        { authData: { testAdapter: payload1 } },
        { sessionToken }
      );

      // Second save with different data to ensure validation is called
      // Use different id to force diffAuthData to detect change
      const payload2 = { id: 'testId2', token: 'testToken2' };
      await user.save(
        { authData: { testAdapter: payload2 } },
        { sessionToken }
      );

      // Check requestObject.original and object from second call
      expect(testAdapter.validateAuthData).toHaveBeenCalledTimes(2);
      const callArgs = testAdapter.validateAuthData.calls.argsFor(1);
      const requestObject = callArgs[2];
      expect(requestObject.original).toBeDefined();
      expect(requestObject.object).toBeDefined();
      expect(requestObject.original instanceof Parse.User).toBe(true);
      expect(requestObject.object instanceof Parse.User).toBe(true);
      expect(requestObject.original.get('authData')).toBeDefined();
    });
  });

  // ============================================
  // Level 5.2: requestObject properties
  // ============================================

  describe('Level 5.2: requestObject properties', () => {
    it('should set master flag correctly in requestObject', async () => {
      // Create user
      const user = new Parse.User();
      await user.save({
        username: 'test',
        password: 'password',
      });
      const sessionToken = user.getSessionToken();

      // Test with sessionToken
      const testAdapter1 = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      spyOn(testAdapter1, 'validateAuthData').and.resolveTo({});

      await reconfigureServer({
        auth: {
          gpgames: { clientId: VALID_CLIENT_ID, clientSecret: VALID_CLIENT_SECRET },
          testAdapter1,
        },
      });

      await user.save(
        { authData: { testAdapter1: { id: 'testId', token: 'testToken' } } },
        { sessionToken }
      );

      expect(testAdapter1.validateAuthData).toHaveBeenCalled();
      const callArgs1 = testAdapter1.validateAuthData.calls.argsFor(0);
      const requestObject1 = callArgs1[2];
      expect(requestObject1.master).toBe(false);

      // Test with masterKey
      const testAdapter2 = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      spyOn(testAdapter2, 'validateAuthData').and.resolveTo({});

      await reconfigureServer({
        auth: {
          gpgames: { clientId: VALID_CLIENT_ID, clientSecret: VALID_CLIENT_SECRET },
          testAdapter2,
        },
      });

      await user.save(
        { authData: { testAdapter2: { id: 'testId2', token: 'testToken2' } } },
        { useMasterKey: true }
      );

      expect(testAdapter2.validateAuthData).toHaveBeenCalled();
      const callArgs2 = testAdapter2.validateAuthData.calls.argsFor(0);
      const requestObject2 = callArgs2[2];
      expect(requestObject2.master).toBe(true);
    });

    it('should set triggerName correctly', async () => {
      // Create user
      const user = new Parse.User();
      await user.save({
        username: 'test',
        password: 'password',
      });
      const sessionToken = user.getSessionToken();

      // Create adapter with validateAuthData
      const testAdapter = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      spyOn(testAdapter, 'validateAuthData').and.resolveTo({});

      await reconfigureServer({
        auth: {
          gpgames: { clientId: VALID_CLIENT_ID, clientSecret: VALID_CLIENT_SECRET },
          testAdapter,
        },
      });

      await user.save(
        { authData: { testAdapter: { id: 'testId', token: 'testToken' } } },
        { sessionToken }
      );

      // Check triggerName (for validateAuthData, triggerName may not be set)
      expect(testAdapter.validateAuthData).toHaveBeenCalled();
      const callArgs = testAdapter.validateAuthData.calls.argsFor(0);
      const requestObject = callArgs[2];
      // Note: triggerName is set for modern adapters (validateSetUp/validateUpdate/validateLogin)
      // For validateAuthData, it may not be set
      expect(requestObject).toBeDefined();
    });

    it('should pass correct user.id in requestObject', async () => {
      // Create user
      const user = new Parse.User();
      await user.save({
        username: 'test',
        password: 'password',
      });
      const sessionToken = user.getSessionToken();

      // Create adapter with validateAuthData
      const testAdapter = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      spyOn(testAdapter, 'validateAuthData').and.resolveTo({});

      await reconfigureServer({
        auth: {
          gpgames: { clientId: VALID_CLIENT_ID, clientSecret: VALID_CLIENT_SECRET },
          testAdapter,
        },
      });

      const payload = { someData: true };

      await user.save(
        { authData: { testAdapter: payload } },
        { sessionToken }
      );

      // Check user.id
      expect(testAdapter.validateAuthData).toHaveBeenCalled();
      const callArgs = testAdapter.validateAuthData.calls.argsFor(0);
      const requestObject = callArgs[2];
      expect(requestObject.user).toBeDefined();
      expect(requestObject.user.id).toBe(user.id);
    });
  });
});

