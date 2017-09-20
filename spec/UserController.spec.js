var UserController = require('../src/Controllers/UserController').UserController;
var emailAdapter = require('./MockEmailAdapter')
var AppCache = require('../src/cache').AppCache;

describe('UserController', () => {
  var user = {
    _email_verify_token: 'testToken',
    username: 'testUser',
    email: 'test@example.com'
  }

  describe('sendVerificationEmail', () => {
    describe('parseFrameURL not provided', () => {
      it('uses publicServerURL', (done) => {

        AppCache.put(defaultConfiguration.appId, Object.assign({}, defaultConfiguration, {
          publicServerURL: 'http://www.example.com',
          customPages: {
            parseFrameURL: undefined
          }
        }))

        emailAdapter.sendVerificationEmail = (options) => {
          expect(options.link).toEqual('http://www.example.com/apps/test/verify_email?token=testToken&username=testUser')
          done()
        }

        var userController = new UserController(emailAdapter, 'test', {
          verifyUserEmails: true
        })

        userController.sendVerificationEmail(user)
      })
    })

    describe('parseFrameURL provided', () => {
      it('uses parseFrameURL and includes the destination in the link parameter', (done) => {

        AppCache.put(defaultConfiguration.appId, Object.assign({}, defaultConfiguration, {
          publicServerURL: 'http://www.example.com',
          customPages: {
            parseFrameURL: 'http://someother.example.com/handle-parse-iframe'
          }
        }))

        emailAdapter.sendVerificationEmail = (options) => {
          expect(options.link).toEqual('http://someother.example.com/handle-parse-iframe?link=%2Fapps%2Ftest%2Fverify_email&token=testToken&username=testUser')
          done()
        }

        var userController = new UserController(emailAdapter, 'test', {
          verifyUserEmails: true
        })

        userController.sendVerificationEmail(user)
      })
    })
  })
});
