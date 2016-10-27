"use strict";

let MockEmailAdapterWithOptions = require('./MockEmailAdapterWithOptions');
let request = require('request');
let Config = require("../src/Config");

describe("Custom Pages, Email Verification, Password Reset", () => {
  it("should set the custom pages", (done) => {
    reconfigureServer({
      appName: 'unused',
      customPages: {
        invalidLink: "myInvalidLink",
        verifyEmailSuccess: "myVerifyEmailSuccess",
        choosePassword: "myChoosePassword",
        passwordResetSuccess: "myPasswordResetSuccess"
      },
      publicServerURL: "https://my.public.server.com/1"
    })
    .then(() => {
      var config = new Config("test");
      expect(config.invalidLinkURL).toEqual("myInvalidLink");
      expect(config.verifyEmailSuccessURL).toEqual("myVerifyEmailSuccess");
      expect(config.choosePasswordURL).toEqual("myChoosePassword");
      expect(config.passwordResetSuccessURL).toEqual("myPasswordResetSuccess");
      expect(config.verifyEmailURL).toEqual("https://my.public.server.com/1/apps/test/verify_email");
      expect(config.requestResetPasswordURL).toEqual("https://my.public.server.com/1/apps/test/request_password_reset");
      done();
    });
  });

  it('sends verification email if email verification is enabled', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      spyOn(emailAdapter, 'sendVerificationEmail');
      var user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.setEmail('testIfEnabled@parse.com');
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
  });

  it('does not send verification email when verification is enabled and email is not set', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
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
  });

  it('does send a validation email when updating the email', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      spyOn(emailAdapter, 'sendVerificationEmail');
      var user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.signUp(null, {
        success: function(user) {
          expect(emailAdapter.sendVerificationEmail).not.toHaveBeenCalled();
          user.fetch()
          .then((user) => {
            user.set("email", "testWhenUpdating@parse.com");
            return user.save();
          }).then((user) => {
            return user.fetch();
          }).then(() => {
            expect(user.get('emailVerified')).toEqual(false);
            // Wait as on update email, we need to fetch the username
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
  });

  it('does send a validation email with valid verification link when updating the email', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      spyOn(emailAdapter, 'sendVerificationEmail').and.callFake((options) => {
        expect(options.link).not.toBeNull();
        expect(options.link).not.toMatch(/token=undefined/);
        Promise.resolve();
      });
      var user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.signUp(null, {
        success: function(user) {
          expect(emailAdapter.sendVerificationEmail).not.toHaveBeenCalled();
          user.fetch()
          .then((user) => {
            user.set("email", "testValidLinkWhenUpdating@parse.com");
            return user.save();
          }).then((user) => {
            return user.fetch();
          }).then(() => {
            expect(user.get('emailVerified')).toEqual(false);
            // Wait as on update email, we need to fetch the username
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
  });

  it('does send with a simple adapter', done => {
    var calls = 0;
    var emailAdapter = {
      sendMail: function(options){
        expect(options.to).toBe('testSendSimpleAdapter@parse.com');
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
    reconfigureServer({
      appName: 'My Cool App',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      var user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set("email", "testSendSimpleAdapter@parse.com");
      user.signUp(null, {
        success: function(user) {
          expect(calls).toBe(1);
          user.fetch()
          .then((user) => {
            return user.save();
          }).then((user) => {
            return Parse.User.requestPasswordReset("testSendSimpleAdapter@parse.com").catch((err) => {
              fail('Should not fail requesting a password');
              done();
            })
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
  });

  it('prevents user from login if email is not verified but preventLoginWithUnverifiedEmail is set to true', done => {
    reconfigureServer({
      appName: 'test',
      publicServerURL: 'http://localhost:1337/1',
      verifyUserEmails: true,
      preventLoginWithUnverifiedEmail: true,
      emailAdapter: MockEmailAdapterWithOptions({
        fromAddress: 'parse@example.com',
        apiKey: 'k',
        domain: 'd',
      }),
    })
    .then(() => {
      let user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set("email", "testInvalidConfig@parse.com");
      user.signUp(null)
      .then(user => Parse.User.logIn("zxcv", "asdf"))
      .then(result => {
        fail('login should have failed');
        done();
      }, error => {
        expect(error.message).toEqual('User email is not verified.')
        done();
      });
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('allows user to login only after user clicks on the link to confirm email address if preventLoginWithUnverifiedEmail is set to true', done => {
    var user = new Parse.User();
    var sendEmailOptions;
    var emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    }
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      preventLoginWithUnverifiedEmail: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setPassword("other-password");
      user.setUsername("user");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(() => {
      expect(sendEmailOptions).not.toBeUndefined();
      request.get(sendEmailOptions.link, {
          followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/verify_email_success.html?username=user');
        user.fetch()
        .then(() => {
          expect(user.get('emailVerified')).toEqual(true);

          Parse.User.logIn("user", "other-password")
          .then(user => {
            expect(typeof user).toBe('object');
            expect(user.get('emailVerified')).toBe(true);
            done();
          }, error => {
            fail('login should have succeeded');
            done();
          });
        }, (err) => {
          jfail(err);
          fail("this should not fail");
          done();
        }).catch((err) => {
          jfail(err);
          done();
        })
      });
    });
  });

  it('allows user to login if email is not verified but preventLoginWithUnverifiedEmail is set to false', done => {
    reconfigureServer({
      appName: 'test',
      publicServerURL: 'http://localhost:1337/1',
      verifyUserEmails: true,
      preventLoginWithUnverifiedEmail: false,
      emailAdapter: MockEmailAdapterWithOptions({
        fromAddress: 'parse@example.com',
        apiKey: 'k',
        domain: 'd',
      }),
    })
    .then(() => {
      let user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set("email", "testInvalidConfig@parse.com");
      user.signUp(null)
      .then(user => Parse.User.logIn("zxcv", "asdf"))
      .then(user => {
        expect(typeof user).toBe('object');
        expect(user.get('emailVerified')).toBe(false);
        done();
      }, error => {
        fail('login should have succeeded');
        done();
      });
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('fails if you include an emailAdapter, set a publicServerURL, but have no appName and send a password reset email', done => {
    reconfigureServer({
      appName: undefined,
      publicServerURL: 'http://localhost:1337/1',
      emailAdapter: MockEmailAdapterWithOptions({
        fromAddress: 'parse@example.com',
        apiKey: 'k',
        domain: 'd',
      }),
    })
    .then(() => {
      let user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set("email", "testInvalidConfig@parse.com");
      user.signUp(null)
      .then(user => Parse.User.requestPasswordReset("testInvalidConfig@parse.com"))
      .then(result => {
        console.log(result);
        fail('sending password reset email should not have succeeded');
        done();
      }, error => {
        expect(error.message).toEqual('An appName, publicServerURL, and emailAdapter are required for password reset functionality.')
        done();
      });
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('fails if you include an emailAdapter, have an appName, but have no publicServerURL and send a password reset email', done => {
    reconfigureServer({
      appName: undefined,
      emailAdapter: MockEmailAdapterWithOptions({
        fromAddress: 'parse@example.com',
        apiKey: 'k',
        domain: 'd',
      }),
    })
    .then(() => {
      let user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set("email", "testInvalidConfig@parse.com");
      user.signUp(null)
      .then(user => Parse.User.requestPasswordReset("testInvalidConfig@parse.com"))
      .then(result => {
        console.log(result);
        fail('sending password reset email should not have succeeded');
        done();
      }, error => {
        expect(error.message).toEqual('An appName, publicServerURL, and emailAdapter are required for password reset functionality.')
        done();
      });
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('fails if you set a publicServerURL, have an appName, but no emailAdapter and send a password reset email', done => {
    reconfigureServer({
      appName: 'unused',
      publicServerURL: 'http://localhost:1337/1',
      emailAdapter: undefined,
    })
    .then(() => {
      let user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set("email", "testInvalidConfig@parse.com");
      user.signUp(null)
      .then(user => Parse.User.requestPasswordReset("testInvalidConfig@parse.com"))
      .then(result => {
        console.log(result);
        fail('sending password reset email should not have succeeded');
        done();
      }, error => {
        expect(error.message).toEqual('An appName, publicServerURL, and emailAdapter are required for password reset functionality.')
        done();
      });
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('succeeds sending a password reset email if appName, publicServerURL, and email adapter are prodvided', done => {
    reconfigureServer({
      appName: 'coolapp',
      publicServerURL: 'http://localhost:1337/1',
      emailAdapter: MockEmailAdapterWithOptions({
        fromAddress: 'parse@example.com',
        apiKey: 'k',
        domain: 'd',
      }),
    })
    .then(() => {
      let user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set("email", "testInvalidConfig@parse.com");
      user.signUp(null)
      .then(user => Parse.User.requestPasswordReset("testInvalidConfig@parse.com"))
      .then(result => {
        done();
      }, error => {
        done(error);
      });
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('succeeds sending a password reset username if appName, publicServerURL, and email adapter are prodvided', done => {
    let adapter = MockEmailAdapterWithOptions({
      fromAddress: 'parse@example.com',
      apiKey: 'k',
      domain: 'd',
      sendMail: function(options) {
        expect(options.to).toEqual('testValidConfig@parse.com');
        return Promise.resolve();
      }
    });

    // delete that handler to force using the default
    delete adapter.sendPasswordResetEmail;

    spyOn(adapter, 'sendMail').and.callThrough();
    reconfigureServer({
      appName: 'coolapp',
      publicServerURL: 'http://localhost:1337/1',
      emailAdapter: adapter
    })
    .then(() => {
      let user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("testValidConfig@parse.com");
      user.signUp(null)
      .then(user => Parse.User.requestPasswordReset("testValidConfig@parse.com"))
      .then(result => {
        expect(adapter.sendMail).toHaveBeenCalled();
        done();
      }, error => {
        done(error);
      });
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('does not send verification email if email verification is disabled', done => {
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    reconfigureServer({
      appName: 'unused',
      publicServerURL: 'http://localhost:1337/1',
      verifyUserEmails: false,
      emailAdapter: emailAdapter,
    })
    .then(() => {
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
  });

  it('receives the app name and user in the adapter', done => {
    var emailSent = false;
    var emailAdapter = {
      sendVerificationEmail: options => {
        expect(options.appName).toEqual('emailing app');
        expect(options.user.get('email')).toEqual('user@parse.com');
        emailSent = true;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    }
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      var user = new Parse.User();
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set('email', 'user@parse.com');
      user.signUp(null, {
        success: () => {
          expect(emailSent).toBe(true);
          done();
        },
        error: function(userAgain, error) {
          fail('Failed to save user');
          done();
        }
      });
    });
  })

  it('when you click the link in the email it sets emailVerified to true and redirects you', done => {
    var user = new Parse.User();
    var sendEmailOptions;
    var emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    }
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setPassword("other-password");
      user.setUsername("user");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(() => {
      expect(sendEmailOptions).not.toBeUndefined();
      request.get(sendEmailOptions.link, {
          followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/verify_email_success.html?username=user');
        user.fetch()
        .then(() => {
          expect(user.get('emailVerified')).toEqual(true);
          done();
        }, (err) => {
          jfail(err);
          fail("this should not fail");
          done();
        }).catch((err) => {
          jfail(err);
          done();
        })
      });
    });
  });

  it('redirects you to invalid link if you try to verify email incorrecly', done => {
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {}
      },
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      request.get('http://localhost:8378/1/apps/test/verify_email', {
        followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
        done()
      });
    });
  });

  it('redirects you to invalid link if you try to validate a nonexistant users email', done => {
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {}
      },
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      request.get('http://localhost:8378/1/apps/test/verify_email?token=asdfasdf&username=sadfasga', {
        followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
        done();
      });
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
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
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

  it('should send a password reset link', done => {
    var user = new Parse.User();
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        request.get(options.link, {
          followRedirect: false,
        }, (error, response, body) => {
          if (error) {
            jfail(err);
            fail("Failed to get the reset link");
            return;
          }
          expect(response.statusCode).toEqual(302);
          var re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=[a-zA-Z0-9]+\&id=test\&username=zxcv%2Bzxcv/;
          expect(response.body.match(re)).not.toBe(null);
          done();
        });
      },
      sendMail: () => {}
    }
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setPassword("asdf");
      user.setUsername("zxcv+zxcv");
      user.set('email', 'user@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user@parse.com', {
          error: (err) => {
            jfail(err);
            fail("Should not fail requesting a password");
            done();
          }
        });
      });
    });
  });

  it('redirects you to invalid link if you try to request password for a nonexistant users email', done => {
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {}
      },
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      request.get('http://localhost:8378/1/apps/test/request_password_reset?token=asdfasdf&username=sadfasga', {
        followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
        done();
      });
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
            jfail(error);
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
              jfail(error);
              fail("Failed to POST request password reset");
              return;
            }
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/password_reset_success.html');

            Parse.User.logIn("zxcv", "hello").then(function(user){
              let config = new Config('test');
              config.database.adapter.find('_User', { fields: {} }, { 'username': 'zxcv' }, { limit: 1 })
              .then(results => {
                // _perishable_token should be unset after reset password
                expect(results.length).toEqual(1);
                expect(results[0]['_perishable_token']).toEqual(undefined);
                done();
              });
            }, (err) => {
              jfail(err);
              fail("should login with new password");
              done();
            });

          });
        });
      },
      sendMail: () => {}
    }
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setPassword("asdf");
      user.setUsername("zxcv");
      user.set('email', 'user@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user@parse.com', {
          error: (err) => {
            jfail(err);
            fail("Should not fail");
            done();
          }
        });
      });
    });
  });
})
