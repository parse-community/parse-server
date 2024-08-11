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
        url: `${serverURL}/apps/test/verify_email?username=someemail@somedomain.com&token[$regex]=`,
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
        url: `${serverURL}/apps/test/verify_email?username=someemail@somedomain.com&token=${current._email_verify_token}`,
        method: 'GET',
      });
      await user.fetch({ useMasterKey: true });
      expect(user.get('emailVerified')).toEqual(true);
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
        url: `${serverURL}/apps/test/request_password_reset?username=someemail@somedomain.com&token[$regex]=`,
        method: 'GET',
      });
      expect(passwordResetResponse.status).toEqual(302);
      expect(passwordResetResponse.headers.location).toMatch(`\\/invalid\\_link\\.html`);
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
        url: `${serverURL}/apps/test/request_password_reset?username=someemail@somedomain.com&token=${token}`,
        method: 'GET',
      });
      expect(passwordResetResponse.status).toEqual(302);
      expect(passwordResetResponse.headers.location).toMatch(
        `\\/choose\\_password\\?token\\=${token}\\&`
      );
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
