const request = require('../lib/request');

const serverURL = 'http://localhost:8378/1';
const headers = {
  'Content-Type': 'application/json',
};
const keys = {
  _ApplicationId: 'test',
  _JavaScriptKey: 'test',
};
const emailAdapter = {
  sendVerificationEmail: () => Promise.resolve(),
  sendPasswordResetEmail: () => Promise.resolve(),
  sendMail: () => {},
};
const appName = 'test';
const publicServerURL = 'http://localhost:8378/1';

describe('Regex Vulnerabilities', () => {
  let objectId;
  let sessionToken;
  let partialSessionToken;
  let user;

  beforeEach(async () => {
    await reconfigureServer({
      maintenanceKey: 'test2',
      verifyUserEmails: true,
      emailAdapter,
      appName,
      publicServerURL,
    });

    const signUpResponse = await request({
      url: `${serverURL}/users`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...keys,
        _method: 'POST',
        username: 'someemail@somedomain.com',
        password: 'somepassword',
        email: 'someemail@somedomain.com',
      }),
    });
    objectId = signUpResponse.data.objectId;
    sessionToken = signUpResponse.data.sessionToken;
    partialSessionToken = sessionToken.slice(0, 3);
  });

  describe('on session token', () => {
    it('should not work with regex', async () => {
      try {
        await request({
          url: `${serverURL}/users/me`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            _SessionToken: {
              $regex: partialSessionToken,
            },
            _method: 'GET',
          }),
        });
        fail('should not work');
      } catch (e) {
        expect(e.data.error).toEqual('unauthorized');
      }
    });

    it('should work with plain token', async () => {
      const meResponse = await request({
        url: `${serverURL}/users/me`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _SessionToken: sessionToken,
          _method: 'GET',
        }),
      });
      expect(meResponse.data.objectId).toEqual(objectId);
      expect(meResponse.data.sessionToken).toEqual(sessionToken);
    });
  });

  describe('on verify e-mail', () => {
    beforeEach(async function () {
      const userQuery = new Parse.Query(Parse.User);
      user = await userQuery.get(objectId, { useMasterKey: true });
    });

    it('should not work with regex', async () => {
      expect(user.get('emailVerified')).toEqual(false);
      await request({
        url: `${serverURL}/apps/test/verify_email?token[$regex]=`,
        method: 'GET',
      });
      await user.fetch({ useMasterKey: true });
      expect(user.get('emailVerified')).toEqual(false);
    });

    it_id('92bbb86d-bcda-49fa-8d79-aa0501078044')(it)('should work with plain token', async () => {
      expect(user.get('emailVerified')).toEqual(false);
      const current = await request({
        method: 'GET',
        url: `http://localhost:8378/1/classes/_User/${user.id}`,
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Rest-API-Key': 'test',
          'X-Parse-Maintenance-Key': 'test2',
          'Content-Type': 'application/json',
        },
      }).then(res => res.data);
      // It should work
      await request({
        url: `${serverURL}/apps/test/verify_email?token=${current._email_verify_token}`,
        method: 'GET',
      });
      await user.fetch({ useMasterKey: true });
      expect(user.get('emailVerified')).toEqual(true);
    });
  });

  describe('on password reset request via token (handleResetRequest)', () => {
    beforeEach(async () => {
      user = await Parse.User.logIn('someemail@somedomain.com', 'somepassword');
      // Trigger a password reset to generate a _perishable_token
      await request({
        url: `${serverURL}/requestPasswordReset`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          email: 'someemail@somedomain.com',
        }),
      });
      // Expire the token so the handleResetRequest token-lookup branch matches
      await Parse.Server.database.update(
        '_User',
        { objectId: user.id },
        {
          _perishable_token_expires_at: new Date(Date.now() - 10000),
        }
      );
    });

    it('should not allow $ne operator to match user via token injection', async () => {
      // Without the fix, {$ne: null} matches any user with a non-null expired token,
      // causing a password reset email to be sent — a boolean oracle for token extraction.
      try {
        await request({
          url: `${serverURL}/requestPasswordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            token: { $ne: null },
          }),
        });
        fail('should not succeed with $ne token');
      } catch (e) {
        expect(e.data.code).toEqual(Parse.Error.INVALID_VALUE);
      }
    });

    it('should not allow $regex operator to extract token via injection', async () => {
      try {
        await request({
          url: `${serverURL}/requestPasswordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            token: { $regex: '^.' },
          }),
        });
        fail('should not succeed with $regex token');
      } catch (e) {
        expect(e.data.code).toEqual(Parse.Error.INVALID_VALUE);
      }
    });

    it('should not allow $exists operator for token injection', async () => {
      try {
        await request({
          url: `${serverURL}/requestPasswordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            token: { $exists: true },
          }),
        });
        fail('should not succeed with $exists token');
      } catch (e) {
        expect(e.data.code).toEqual(Parse.Error.INVALID_VALUE);
      }
    });

    it('should not allow $gt operator for token injection', async () => {
      try {
        await request({
          url: `${serverURL}/requestPasswordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            token: { $gt: '' },
          }),
        });
        fail('should not succeed with $gt token');
      } catch (e) {
        expect(e.data.code).toEqual(Parse.Error.INVALID_VALUE);
      }
    });
  });

  describe('on authData id operator injection', () => {
    it('should reject $regex operator in anonymous authData id on login', async () => {
      // Create a victim anonymous user with a known ID prefix
      const victimId = 'victim_' + Date.now();
      const signupRes = await request({
        url: `${serverURL}/users`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          authData: { anonymous: { id: victimId } },
        }),
      });
      expect(signupRes.data.objectId).toBeDefined();

      // Attacker tries to login with $regex to match the victim
      try {
        await request({
          url: `${serverURL}/users`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            _method: 'POST',
            authData: { anonymous: { id: { $regex: '^victim_' } } },
          }),
        });
        fail('should not allow $regex in authData id');
      } catch (e) {
        expect(e.data.code).toEqual(Parse.Error.INVALID_VALUE);
      }
    });

    it('should reject $ne operator in anonymous authData id on login', async () => {
      const victimId = 'victim_ne_' + Date.now();
      await request({
        url: `${serverURL}/users`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          authData: { anonymous: { id: victimId } },
        }),
      });

      try {
        await request({
          url: `${serverURL}/users`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            _method: 'POST',
            authData: { anonymous: { id: { $ne: 'nonexistent' } } },
          }),
        });
        fail('should not allow $ne in authData id');
      } catch (e) {
        expect(e.data.code).toEqual(Parse.Error.INVALID_VALUE);
      }
    });

    it('should reject $exists operator in anonymous authData id on login', async () => {
      const victimId = 'victim_exists_' + Date.now();
      await request({
        url: `${serverURL}/users`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          authData: { anonymous: { id: victimId } },
        }),
      });

      try {
        await request({
          url: `${serverURL}/users`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            _method: 'POST',
            authData: { anonymous: { id: { $exists: true } } },
          }),
        });
        fail('should not allow $exists in authData id');
      } catch (e) {
        expect(e.data.code).toEqual(Parse.Error.INVALID_VALUE);
      }
    });

    it('should allow valid string authData id for anonymous login', async () => {
      const userId = 'valid_anon_' + Date.now();
      const signupRes = await request({
        url: `${serverURL}/users`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          authData: { anonymous: { id: userId } },
        }),
      });
      expect(signupRes.data.objectId).toBeDefined();

      // Same ID should successfully log in
      const loginRes = await request({
        url: `${serverURL}/users`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          authData: { anonymous: { id: userId } },
        }),
      });
      expect(loginRes.data.objectId).toEqual(signupRes.data.objectId);
    });
  });

  describe('on resend verification email', () => {
    // The PagesRouter uses express.urlencoded({ extended: false }) which does not parse
    // nested objects (e.g. token[$regex]=^.), so the HTTP layer already blocks object injection.
    // Non-string tokens are rejected (treated as undefined) to prevent both NoSQL injection
    // and type confusion errors. These tests verify the guard works correctly
    // by directly testing the PagesRouter method.
    it('should reject non-string token as undefined', async () => {
      const { PagesRouter } = require('../lib/Routers/PagesRouter');
      const router = new PagesRouter();
      const goToPage = spyOn(router, 'goToPage').and.returnValue(Promise.resolve());
      const resendSpy = jasmine.createSpy('resendVerificationEmail').and.returnValue(Promise.resolve());
      const req = {
        config: {
          userController: { resendVerificationEmail: resendSpy },
        },
        body: {
          username: 'testuser',
          token: { $regex: '^.' },
        },
      };
      await router.resendVerificationEmail(req);
      // Non-string token should be treated as undefined
      const passedToken = resendSpy.calls.first().args[2];
      expect(passedToken).toBeUndefined();
    });

    it('should pass through valid string token unchanged', async () => {
      const { PagesRouter } = require('../lib/Routers/PagesRouter');
      const router = new PagesRouter();
      const goToPage = spyOn(router, 'goToPage').and.returnValue(Promise.resolve());
      const resendSpy = jasmine.createSpy('resendVerificationEmail').and.returnValue(Promise.resolve());
      const req = {
        config: {
          userController: { resendVerificationEmail: resendSpy },
        },
        body: {
          username: 'testuser',
          token: 'validtoken123',
        },
      };
      await router.resendVerificationEmail(req);
      const passedToken = resendSpy.calls.first().args[2];
      expect(typeof passedToken).toEqual('string');
      expect(passedToken).toEqual('validtoken123');
    });
  });

  describe('on password reset', () => {
    beforeEach(async () => {
      user = await Parse.User.logIn('someemail@somedomain.com', 'somepassword');
    });

    it('should not work with regex', async () => {
      expect(user.id).toEqual(objectId);
      await request({
        url: `${serverURL}/requestPasswordReset`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          email: 'someemail@somedomain.com',
        }),
      });
      await user.fetch({ useMasterKey: true });
      const passwordResetResponse = await request({
        url: `${serverURL}/apps/test/request_password_reset?token[$regex]=`,
        method: 'GET',
      });
      expect(passwordResetResponse.status).toEqual(200);
      expect(passwordResetResponse.text).toContain('Invalid password reset link!');
      await request({
        url: `${serverURL}/apps/test/request_password_reset`,
        method: 'POST',
        body: {
          token: { $regex: '' },
          username: 'someemail@somedomain.com',
          new_password: 'newpassword',
        },
      });
      try {
        await Parse.User.logIn('someemail@somedomain.com', 'newpassword');
        fail('should not work');
      } catch (e) {
        expect(e.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
        expect(e.message).toEqual('Invalid username/password.');
      }
    });

    it('should work with plain token', async () => {
      expect(user.id).toEqual(objectId);
      await request({
        url: `${serverURL}/requestPasswordReset`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          email: 'someemail@somedomain.com',
        }),
      });
      const current = await request({
        method: 'GET',
        url: `http://localhost:8378/1/classes/_User/${user.id}`,
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Rest-API-Key': 'test',
          'X-Parse-Maintenance-Key': 'test2',
          'Content-Type': 'application/json',
        },
      }).then(res => res.data);
      const token = current._perishable_token;
      const passwordResetResponse = await request({
        url: `${serverURL}/apps/test/request_password_reset?token=${token}`,
        method: 'GET',
      });
      expect(passwordResetResponse.status).toEqual(200);
      expect(passwordResetResponse.text).toContain('Reset Your Password');
      await request({
        url: `${serverURL}/apps/test/request_password_reset`,
        method: 'POST',
        body: {
          token,
          username: 'someemail@somedomain.com',
          new_password: 'newpassword',
        },
      });
      const userAgain = await Parse.User.logIn('someemail@somedomain.com', 'newpassword');
      expect(userAgain.id).toEqual(objectId);
    });
  });
});

describe('Regex Vulnerabilities - authData operator injection with custom adapter', () => {
  it('should reject non-string authData id for custom auth adapter on login', async () => {
    await reconfigureServer({
      auth: {
        myAdapter: {
          validateAuthData: () => Promise.resolve(),
          validateAppId: () => Promise.resolve(),
        },
      },
    });

    const victimId = 'adapter_victim_' + Date.now();
    await request({
      url: `${serverURL}/users`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...keys,
        _method: 'POST',
        authData: { myAdapter: { id: victimId, token: 'valid' } },
      }),
    });

    try {
      await request({
        url: `${serverURL}/users`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _method: 'POST',
          authData: { myAdapter: { id: { $regex: '^adapter_victim_' }, token: 'valid' } },
        }),
      });
      fail('should not allow $regex in custom adapter authData id');
    } catch (e) {
      expect(e.data.code).toEqual(Parse.Error.INVALID_VALUE);
    }
  });
});
