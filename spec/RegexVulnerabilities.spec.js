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
        expect(e.data.code).toEqual(209);
        expect(e.data.error).toEqual('Invalid session token');
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

  describe('on resend verification email', () => {
    // The PagesRouter uses express.urlencoded({ extended: false }) which does not parse
    // nested objects (e.g. token[$regex]=^.), so the HTTP layer already blocks object injection.
    // The toString() guard in resendVerificationEmail() is defense-in-depth in case the
    // body parser configuration changes. These tests verify the guard works correctly
    // by directly testing the PagesRouter method.
    it('should sanitize non-string token to string via toString()', async () => {
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
      // The token passed to userController.resendVerificationEmail should be a string
      const passedToken = resendSpy.calls.first().args[2];
      expect(typeof passedToken).toEqual('string');
      expect(passedToken).toEqual('[object Object]');
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
