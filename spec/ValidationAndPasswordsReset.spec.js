"use strict";

var request = require('request');
var cache = require("../src/cache");
describe("Custom Pages Configuration", () => {
  it("should set the custom pages", (done) => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      customPages: {
        invalidLink: "myInvalidLink",
        verifyEmailSuccess: "myVerifyEmailSuccess",
        choosePassword: "myChoosePassword",
        passwordResetSuccess: "myPasswordResetSuccess"
      },
      publicServerURL: "https://my.public.server.com/1"
    });
    
    var config = cache.apps.get("test");
    
    expect(config.invalidLinkURL).toEqual("myInvalidLink");
    expect(config.verifyEmailSuccessURL).toEqual("myVerifyEmailSuccess");
    expect(config.choosePasswordURL).toEqual("myChoosePassword");
    expect(config.passwordResetSuccessURL).toEqual("myPasswordResetSuccess");
    expect(config.verifyEmailURL).toEqual("https://my.public.server.com/1/apps/test/verify_email");
    expect(config.requestResetPasswordURL).toEqual("https://my.public.server.com/1/apps/test/request_password_reset");
    done();
  });
});

describe("Email Verification", () => {
  it('sends verification email if email verification is enabled', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    spyOn(emailAdapter, 'sendVerificationEmail');
    var user = new Parse.User();
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.setEmail('cool_guy@parse.com');
    user.signUp(null, {
      success: function(user) {
        expect(emailAdapter.sendVerificationEmail).toHaveBeenCalled();
        user.fetch()
        .then(() => {
          expect(user.get('emailVerified')).toEqual(false);
          done();
        });
      },
      error: function(userAgain, error) {
        fail('Failed to save user');
        done();
      }
    });
  });
  
  it('does not send verification email when verification is enabled and email is not set', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    spyOn(emailAdapter, 'sendVerificationEmail');
    var user = new Parse.User();
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.signUp(null, {
      success: function(user) {
        expect(emailAdapter.sendVerificationEmail).not.toHaveBeenCalled();
        user.fetch()
        .then(() => {
          expect(user.get('emailVerified')).toEqual(undefined);
          done();
        });
      },
      error: function(userAgain, error) {
        fail('Failed to save user');
        done();
      }
    });
  });
  
  it('does send a validation email when updating the email', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    spyOn(emailAdapter, 'sendVerificationEmail');
    var user = new Parse.User();
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.signUp(null, {
      success: function(user) {
        expect(emailAdapter.sendVerificationEmail).not.toHaveBeenCalled();
        user.fetch()
        .then((user) => {
          user.set("email", "cool_guy@parse.com");
          return user.save();
        }).then((user) => {
          return user.fetch();
        }).then(() => {
          expect(user.get('emailVerified')).toEqual(false);
          // Wait as on update emai, we need to fetch the username
          setTimeout(function(){
            expect(emailAdapter.sendVerificationEmail).toHaveBeenCalled();
            done();
          }, 200);
        });
      },
      error: function(userAgain, error) {
        fail('Failed to save user');
        done();
      }
    });
  });
  
  it('does send with a simple adapter', done => {
    var calls = 0;
    var emailAdapter = {
      sendMail: function(options){
        expect(options.to).toBe('cool_guy@parse.com');
        if (calls == 0) {
          expect(options.subject).toEqual('Please verify your e-mail for My Cool App');
          expect(options.text.match(/verify_email/)).not.toBe(null);
        } else if (calls == 1) {
          expect(options.subject).toEqual('Password Reset for My Cool App');
          expect(options.text.match(/request_password_reset/)).not.toBe(null);
        }
        calls++;
        return Promise.resolve();
      }
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'My Cool App',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    var user = new Parse.User();
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.set("email", "cool_guy@parse.com");
    user.signUp(null, {
      success: function(user) {
        expect(calls).toBe(1);
        user.fetch()
        .then((user) => {
          return user.save();
        }).then((user) => {
          return Parse.User.requestPasswordReset("cool_guy@parse.com");
        }).then(() => {
          expect(calls).toBe(2);
          done();
        });
      },
      error: function(userAgain, error) {
        fail('Failed to save user');
        done();
      }
    });
  });

  it('does not send verification email if email verification is disabled', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: false,
      emailAdapter: emailAdapter,
    });
    spyOn(emailAdapter, 'sendVerificationEmail');
    var user = new Parse.User();
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.signUp(null, {
      success: function(user) {
        user.fetch()
        .then(() => {
          expect(emailAdapter.sendVerificationEmail.calls.count()).toEqual(0);
          expect(user.get('emailVerified')).toEqual(undefined);
          done();
        });
      },
      error: function(userAgain, error) {
        fail('Failed to save user');
        done();
      }
    });
  });

  it('receives the app name and user in the adapter', done => {
    var emailAdapter = {
      sendVerificationEmail: options => {
        expect(options.appName).toEqual('emailing app');
        expect(options.user.get('email')).toEqual('user@parse.com');
        done();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'emailing app',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    var user = new Parse.User();
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.set('email', 'user@parse.com');
    user.signUp(null, {
      success: () => {},
      error: function(userAgain, error) {
        fail('Failed to save user');
        done();
      }
    });
  })

  it('when you click the link in the email it sets emailVerified to true and redirects you', done => {
    var user = new Parse.User();
    var emailAdapter = {
      sendVerificationEmail: options => {
        request.get(options.link, {
          followRedirect: false,
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(302);
          expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/verify_email_success.html?username=zxcv');
          user.fetch()
          .then(() => {
            expect(user.get('emailVerified')).toEqual(true);
            done();
          }, (err) => {
            console.error(err);
            fail("this should not fail");
            done();
          });
        });
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'emailing app',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.set('email', 'user@parse.com');
    user.signUp();
  });

  it('redirects you to invalid link if you try to verify email incorrecly', done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'emailing app',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {}
      },
      publicServerURL: "http://localhost:8378/1"
    });
    request.get('http://localhost:8378/1/apps/test/verify_email', {
      followRedirect: false,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(302);
      expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
      done()
    });
  });

  it('redirects you to invalid link if you try to validate a nonexistant users email', done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'emailing app',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {}
      },
      publicServerURL: "http://localhost:8378/1"
    });
    request.get('http://localhost:8378/1/apps/test/verify_email?token=asdfasdf&username=sadfasga', {
      followRedirect: false,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(302);
      expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
      done();
    });
  });

  it('does not update email verified if you use an invalid token', done => {
    var user = new Parse.User();
    var emailAdapter = {
      sendVerificationEmail: options => {
        request.get('http://localhost:8378/1/apps/test/verify_email?token=invalid&username=zxcv', {
          followRedirect: false,
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(302);
          expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
          user.fetch()
          .then(() => {
            expect(user.get('emailVerified')).toEqual(false);
            done();
          });
        });
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'emailing app',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.set('email', 'user@parse.com');
    user.signUp(null, {
      success: () => {},
      error: function(userAgain, error) {
        fail('Failed to save user');
        done();
      }
    });
  });
});

describe("Password Reset", () => {
  
  it('should send a password reset link', done => {
    var user = new Parse.User();
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        request.get(options.link, {
          followRedirect: false,
        }, (error, response, body) => {
          if (error) {
            console.error(error);
            fail("Failed to get the reset link");
            return;
          }
          expect(response.statusCode).toEqual(302);
          var re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=[a-zA-Z0-9]+\&id=test\&username=zxcv/;
          expect(response.body.match(re)).not.toBe(null);
          done();
        });
      },
      sendMail: () => {}
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'emailing app',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.set('email', 'user@parse.com');
    user.signUp().then(() => {
      Parse.User.requestPasswordReset('user@parse.com', {
        error: (err) => {
          console.error(err);
          fail("Should not fail");
          done();
        }
      });
    });
  });
  
  it('redirects you to invalid link if you try to request password for a nonexistant users email', done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'emailing app',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {}
      },
      publicServerURL: "http://localhost:8378/1"
    });
    request.get('http://localhost:8378/1/apps/test/request_password_reset?token=asdfasdf&username=sadfasga', {
      followRedirect: false,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(302);
      expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
      done();
    });
  });

  it('should programatically reset password', done => {
    var user = new Parse.User();
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        request.get(options.link, {
          followRedirect: false,
        }, (error, response, body) => {
          if (error) {
            console.error(error);
            fail("Failed to get the reset link");
            return;
          }
          expect(response.statusCode).toEqual(302);
          var re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=([a-zA-Z0-9]+)\&id=test\&username=zxcv/;
          var match = response.body.match(re);
          if (!match) {
            fail("should have a token");
            done();
            return;
          }
          var token = match[1];
          
          request.post({ 
            url: "http://localhost:8378/1/apps/test/request_password_reset" ,
            body: `new_password=hello&token=${token}&username=zxcv`,
            headers: {
               'Content-Type': 'application/x-www-form-urlencoded'
            },
            followRedirect: false,
          }, (error, response, body) => {
            if (error) {
              console.error(error);
              fail("Failed to POST request password reset");
              return;
            }
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/password_reset_success.html');
            
            Parse.User.logIn("zxcv", "hello").then(function(user){
              done();
            }, (err) => {
              console.error(err);
              fail("should login with new password");
              done();
            });
            
          });
        });
      },
      sendMail: () => {}
    }
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'emailing app',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    });
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.set('email', 'user@parse.com');
    user.signUp().then(() => {
      Parse.User.requestPasswordReset('user@parse.com', {
        error: (err) => {
          console.error(err);
          fail("Should not fail");
          done();
        }
      });
    });
  });
  
})

