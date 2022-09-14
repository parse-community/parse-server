const UserController = require('../lib/Controllers/UserController').UserController;
const emailAdapter = require('./support/MockEmailAdapter');

describe('UserController', () => {
  const user = {
    _email_verify_token: 'testToken',
    username: 'testUser',
    email: 'test@example.com',
  };

  describe('sendVerificationEmail', () => {
    describe('parseFrameURL not provided', () => {
      it('uses publicServerURL', async done => {
        await reconfigureServer({
          publicServerURL: 'http://www.example.com',
          customPages: {
            parseFrameURL: undefined,
          },
        });
        emailAdapter.sendVerificationEmail = options => {
          expect(options.link).toEqual(
            'http://www.example.com/apps/test/verify_email?token=testToken&username=testUser'
          );
          emailAdapter.sendVerificationEmail = () => Promise.resolve();
          done();
        };
        const userController = new UserController(emailAdapter, 'test', {
          verifyUserEmails: true,
        });
        userController.sendVerificationEmail(user);
      });
    });

    describe('parseFrameURL provided', () => {
      it('uses parseFrameURL and includes the destination in the link parameter', async done => {
        await reconfigureServer({
          publicServerURL: 'http://www.example.com',
          customPages: {
            parseFrameURL: 'http://someother.example.com/handle-parse-iframe',
          },
        });
        emailAdapter.sendVerificationEmail = options => {
          expect(options.link).toEqual(
            'http://someother.example.com/handle-parse-iframe?link=%2Fapps%2Ftest%2Fverify_email&token=testToken&username=testUser'
          );
          emailAdapter.sendVerificationEmail = () => Promise.resolve();
          done();
        };
        const userController = new UserController(emailAdapter, 'test', {
          verifyUserEmails: true,
        });
        userController.sendVerificationEmail(user);
      });
    });
  });
});
