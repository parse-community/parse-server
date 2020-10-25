const UserController = require('../lib/Controllers/UserController').UserController;
const emailAdapter = require('./MockEmailAdapter');
const AppCache = require('../lib/cache').AppCache;

describe('UserController', () => {
  const user = {
    _email_verify_token: 'testToken',
    username: 'testUser',
    email: 'test@example.com',
  };

  describe('sendVerificationEmail', () => {
    describe('parseFrameURL not provided', () => {
      it('uses publicServerURL', done => {
        AppCache.put(
          defaultConfiguration.appId,
          Object.assign({}, defaultConfiguration, {
            publicServerURL: 'http://www.example.com',
            customPages: {
              parseFrameURL: undefined,
            },
          })
        );

        emailAdapter.sendVerificationEmail = options => {
          expect(options.link).toEqual(
            'http://www.example.com/apps/test/verify_email?token=testToken&username=testUser'
          );
          done();
        };

        const userController = new UserController(emailAdapter, 'test', {
          verifyUserEmails: true,
        });

        userController.sendVerificationEmail(user);
      });
    });

    describe('parseFrameURL provided', () => {
      it('uses parseFrameURL and includes the destination in the link parameter', done => {
        AppCache.put(
          defaultConfiguration.appId,
          Object.assign({}, defaultConfiguration, {
            publicServerURL: 'http://www.example.com',
            customPages: {
              parseFrameURL: 'http://someother.example.com/handle-parse-iframe',
            },
          })
        );

        emailAdapter.sendVerificationEmail = options => {
          expect(options.link).toEqual(
            'http://someother.example.com/handle-parse-iframe?link=%2Fapps%2Ftest%2Fverify_email&token=testToken&username=testUser'
          );
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
