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

describe('Regex Vulnerabilities', function () {
  beforeEach(async function () {
    await reconfigureServer({
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
    this.objectId = signUpResponse.data.objectId;
    this.sessionToken = signUpResponse.data.sessionToken;
    this.partialSessionToken = this.sessionToken.slice(0, 3);
  });

  describe('on session token', function () {
    it('should not work with regex', async function () {
      try {
        await request({
          url: `${serverURL}/users/me`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...keys,
            _SessionToken: {
              $regex: this.partialSessionToken,
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

    it('should work with plain token', async function () {
      const meResponse = await request({
        url: `${serverURL}/users/me`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...keys,
          _SessionToken: this.sessionToken,
          _method: 'GET',
        }),
      });
      expect(meResponse.data.objectId).toEqual(this.objectId);
      expect(meResponse.data.sessionToken).toEqual(this.sessionToken);
    });
  });

  describe('on verify e-mail', function () {
    beforeEach(async function () {
      const userQuery = new Parse.Query(Parse.User);
      this.user = await userQuery.get(this.objectId, { useMasterKey: true });
    });

    it('should not work with regex', async function () {
      expect(this.user.get('emailVerified')).toEqual(false);
      await request({
        url: `${serverURL}/apps/test/verify_email?username=someemail@somedomain.com&token[$regex]=`,
        method: 'GET',
      });
      await this.user.fetch({ useMasterKey: true });
      expect(this.user.get('emailVerified')).toEqual(false);
    });

    it('should work with plain token', async function () {
      expect(this.user.get('emailVerified')).toEqual(false);
      // It should work
      await request({
        url: `${serverURL}/apps/test/verify_email?username=someemail@somedomain.com&token=${this.user.get(
          '_email_verify_token'
        )}`,
        method: 'GET',
      });
      await this.user.fetch({ useMasterKey: true });
      expect(this.user.get('emailVerified')).toEqual(true);
    });
  });

  describe('on password reset', function () {
    beforeEach(async function () {
      this.user = await Parse.User.logIn('someemail@somedomain.com', 'somepassword');
    });

    it('should not work with regex', async function () {
      expect(this.user.id).toEqual(this.objectId);
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
      await this.user.fetch({ useMasterKey: true });
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
        expect(e.code).toEqual(101);
        expect(e.message).toEqual('Invalid username/password.');
      }
    });

    it('should work with plain token', async function () {
      expect(this.user.id).toEqual(this.objectId);
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
      await this.user.fetch({ useMasterKey: true });
      const token = this.user.get('_perishable_token');
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
      expect(userAgain.id).toEqual(this.objectId);
    });
  });
});
