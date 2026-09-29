const emailAdapter = require('./support/MockEmailAdapter');
const Config = require('../lib/Config');
const Auth = require('../lib/Auth');
const { resolvingPromise } = require('../lib/TestUtils');

describe('UserController', () => {
  describe('sendVerificationEmail', () => {
    describe('parseFrameURL not provided', () => {
      it_id('61338330-eca7-4c33-8816-7ff05966f43b')(it)('uses publicServerURL', async () => {
        await reconfigureServer({
          publicServerURL: 'http://www.example.com',
          customPages: {
            parseFrameURL: undefined,
          },
          verifyUserEmails: true,
          emailAdapter,
          appName: 'test',
        });

        let emailOptions;
        const sendPromise = resolvingPromise();
        emailAdapter.sendVerificationEmail = options => {
          emailOptions = options;
          sendPromise.resolve();
        };

        const username = 'verificationUser';
        const user = new Parse.User();
        user.setUsername(username);
        user.setPassword('pass');
        user.setEmail('verification@example.com');
        await user.signUp();
        await sendPromise;

        const config = Config.get('test');
        const rawUser = await config.database.find('_User', { username }, {}, Auth.maintenance(config));
        const rawUsername = rawUser[0].username;
        const rawToken = rawUser[0]._email_verify_token;
        expect(rawToken).toBeDefined();
        expect(rawUsername).toBe(username);

        expect(emailOptions.link).toEqual(`http://www.example.com/apps/test/verify_email?token=${rawToken}`);
      });
    });

    describe('parseFrameURL provided', () => {
      it_id('673c2bb1-049e-4dda-b6be-88c866260036')(it)('uses parseFrameURL and includes the destination in the link parameter', async () => {
        await reconfigureServer({
          publicServerURL: 'http://www.example.com',
          customPages: {
            parseFrameURL: 'http://someother.example.com/handle-parse-iframe',
          },
          verifyUserEmails: true,
          emailAdapter,
          appName: 'test',
        });

        let emailOptions;
        const sendPromise = resolvingPromise();
        emailAdapter.sendVerificationEmail = options => {
          emailOptions = options;
          sendPromise.resolve();
        };

        const username = 'verificationUser';
        const user = new Parse.User();
        user.setUsername(username);
        user.setPassword('pass');
        user.setEmail('verification@example.com');
        await user.signUp();
        await sendPromise;

        const config = Config.get('test');
        const rawUser = await config.database.find('_User', { username }, {}, Auth.maintenance(config));
        const rawUsername = rawUser[0].username;
        const rawToken = rawUser[0]._email_verify_token;
        expect(rawToken).toBeDefined();
        expect(rawUsername).toBe(username);

        expect(emailOptions.link).toEqual(`http://someother.example.com/handle-parse-iframe?link=%2Fapps%2Ftest%2Fverify_email&token=${rawToken}`);
      });
    });
  });

  describe('email adapter send rejection (#8496)', () => {
    it('logs and does not crash when the verification email adapter rejects', async () => {
      const logged = resolvingPromise();
      const adapter = {
        sendVerificationEmail: () => Promise.reject(new Error('boom')),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => Promise.resolve(),
      };
      await reconfigureServer({
        verifyUserEmails: true,
        emailAdapter: adapter,
        appName: 'test',
        publicServerURL: 'http://localhost:8378/1',
      });
      spyOn(require('../lib/logger').logger, 'error').and.callFake(msg => logged.resolve(msg));

      const user = new Parse.User();
      user.setUsername('u8496a');
      user.setPassword('pass');
      user.setEmail('u8496a@example.com');
      await user.signUp();

      const msg = await logged;
      expect(msg).toContain('Failed to send verification email');
    });

    it('logs and does not crash when the password reset email adapter rejects', async () => {
      const logged = resolvingPromise();
      const adapter = {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.reject(new Error('boom')),
        sendMail: () => Promise.resolve(),
      };
      await reconfigureServer({
        appName: 'test',
        emailAdapter: adapter,
        publicServerURL: 'http://localhost:8378/1',
      });

      const user = new Parse.User();
      user.setUsername('u8496b');
      user.setPassword('pass');
      user.setEmail('u8496b@example.com');
      await user.signUp();

      spyOn(require('../lib/logger').logger, 'error').and.callFake(msg => logged.resolve(msg));
      await Parse.User.requestPasswordReset('u8496b@example.com');

      const msg = await logged;
      expect(msg).toContain('Failed to send password reset email');
    });
  });
});
