const emailAdapter = require('./support/MockEmailAdapter');
const Config = require('../lib/Config');
const Auth = require('../lib/Auth');

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
        emailAdapter.sendVerificationEmail = options => {
          emailOptions = options;
          return Promise.resolve();
        };

        const username = 'verificationUser';
        const user = new Parse.User();
        user.setUsername(username);
        user.setPassword('pass');
        user.setEmail('verification@example.com');
        await user.signUp();

        const config = Config.get('test');
        const rawUser = await config.database.find('_User', { username }, {}, Auth.maintenance(config));
        const rawUsername = rawUser[0].username;
        const rawToken = rawUser[0]._email_verify_token;
        expect(rawToken).toBeDefined();
        expect(rawUsername).toBe(username);
        expect(emailOptions.link).toEqual(`http://www.example.com/apps/test/verify_email?token=${rawToken}&username=${username}`);
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
        emailAdapter.sendVerificationEmail = options => {
          emailOptions = options;
          return Promise.resolve();
        };

        const username = 'verificationUser';
        const user = new Parse.User();
        user.setUsername(username);
        user.setPassword('pass');
        user.setEmail('verification@example.com');
        await user.signUp();

        const config = Config.get('test');
        const rawUser = await config.database.find('_User', { username }, {}, Auth.maintenance(config));
        const rawUsername = rawUser[0].username;
        const rawToken = rawUser[0]._email_verify_token;
        expect(rawToken).toBeDefined();
        expect(rawUsername).toBe(username);
        expect(emailOptions.link).toEqual(`http://someother.example.com/handle-parse-iframe?link=%2Fapps%2Ftest%2Fverify_email&token=${rawToken}&username=${username}`);
      });
    });
  });
});
