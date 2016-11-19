"use strict";

const requestp = require('request-promise');
const Config = require('../src/Config');

describe("Password Policy: ", () => {

  it('should show the invalid link page if the user clicks on the password reset link after the token expires', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        sendEmailOptions = options;
      },
      sendMail: () => {
      }
    };
    reconfigureServer({
      appName: 'passwordPolicy',
      emailAdapter: emailAdapter,
      passwordPolicy: {
        resetTokenValidityDuration: 0.5, // 0.5 second
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("testResetTokenValidity");
      user.setPassword("original");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(user => {
      Parse.User.requestPasswordReset('user@parse.com').catch((err) => {
        jfail(err);
        fail("Reset password request should not fail");
        done();
      });
    }).then(() => {
      // wait for a bit more than the validity duration set
      setTimeout(() => {
        expect(sendEmailOptions).not.toBeUndefined();

        requestp.get({
          uri: sendEmailOptions.link,
          followRedirect: false,
          simple: false,
          resolveWithFullResponse: true
        }).then((response) => {
          expect(response.statusCode).toEqual(302);
          expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
          done();
        }).catch((error) => {
          fail(error);
        });
      }, 1000);
    }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('should show the reset password page if the user clicks on the password reset link before the token expires', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        sendEmailOptions = options;
      },
      sendMail: () => {
      }
    };
    reconfigureServer({
      appName: 'passwordPolicy',
      emailAdapter: emailAdapter,
      passwordPolicy: {
        resetTokenValidityDuration: 5, // 5 seconds
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("testResetTokenValidity");
      user.setPassword("original");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(user => {
      Parse.User.requestPasswordReset('user@parse.com').catch((err) => {
        jfail(err);
        fail("Reset password request should not fail");
        done();
      });
    }).then(() => {
      // wait for a bit but less than the validity duration
      setTimeout(() => {
        expect(sendEmailOptions).not.toBeUndefined();

        requestp.get({
          uri: sendEmailOptions.link,
          simple: false,
          resolveWithFullResponse: true,
          followRedirect: false
        }).then((response) => {
          expect(response.statusCode).toEqual(302);
          const re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=[a-zA-Z0-9]+\&id=test\&username=testResetTokenValidity/;
          expect(response.body.match(re)).not.toBe(null);
          done();
        }).catch((error) => {
          fail(error);
        });
      }, 1000);
    }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('should fail if passwordPolicy.resetTokenValidityDuration is not a number', done => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        resetTokenValidityDuration: "not a number"
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      fail('passwordPolicy.resetTokenValidityDuration "not a number" test failed');
      done();
    }).catch(err => {
      expect(err).toEqual('passwordPolicy.resetTokenValidityDuration must be a positive number');
      done();
    });
  });

  it('should fail if passwordPolicy.resetTokenValidityDuration is zero or a negative number', done => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        resetTokenValidityDuration: 0
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      fail('resetTokenValidityDuration negative number test failed');
      done();
    }).catch(err => {
      expect(err).toEqual('passwordPolicy.resetTokenValidityDuration must be a positive number');
      done();
    });
  });

  it('should fail if passwordPolicy.validatorPattern setting is invalid type', done => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorPattern: "abc" // string is not a valid setting
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      fail('passwordPolicy.validatorPattern type test failed');
      done();
    }).catch(err => {
      expect(err).toEqual('passwordPolicy.validatorPattern must be a RegExp.');
      done();
    });
  });

  it('should fail if passwordPolicy.validatorCallback setting is invalid type', done => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorCallback: "abc" // string is not a valid setting
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      fail('passwordPolicy.validatorCallback type test failed');
      done();
    }).catch(err => {
      expect(err).toEqual('passwordPolicy.validatorCallback must be a function.');
      done();
    });
  });

  it('signup should fail if password does not conform to the policy enforced using validatorPattern', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorPattern: /[0-9]+/  // password should contain at least one digit
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("nodigit");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        fail('Should have failed as password does not conform to the policy.');
        done();
      }).catch((error) => {
        expect(error.code).toEqual(142);
        done();
      });
    })
  });

  it('signup should succeed if password conforms to the policy enforced using validatorPattern', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorPattern: /[0-9]+/  // password should contain at least one digit
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("1digit");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        Parse.User.logOut().then(() => {
          Parse.User.logIn("user1", "1digit").then(function (user) {
            done();
          }).catch((err) => {
            jfail(err);
            fail("Should be able to login");
            done();
          });
        }).catch((error) => {
          jfail(error);
          fail('logout should have succeeded');
          done();
        });
      }).catch((error) => {
        jfail(error);
        fail('Signup should have succeeded as password conforms to the policy.');
        done();
      });
    })
  });

  it('signup should fail if password does not conform to the policy enforced using validatorCallback', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorCallback: password => false  // just fail
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("any");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        fail('Should have failed as password does not conform to the policy.');
        done();
      }).catch((error) => {
        expect(error.code).toEqual(142);
        done();
      });
    })
  });

  it('signup should succeed if password conforms to the policy enforced using validatorCallback', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorCallback: password => true   // never fail
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("oneUpper");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        Parse.User.logOut().then(() => {
          Parse.User.logIn("user1", "oneUpper").then(function (user) {
            done();
          }).catch((err) => {
            jfail(err);
            fail("Should be able to login");
            done();
          });
        }).catch(error => {
          jfail(error);
          fail("Logout should have succeeded");
          done();
        });
      }).catch((error) => {
        jfail(error);
        fail('Should have succeeded as password conforms to the policy.');
        done();
      });
    })
  });

  it('signup should fail if password does not match validatorPattern but succeeds validatorCallback', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorPattern: /[A-Z]+/,  // password should contain at least one UPPER case letter
        validatorCallback: value => true
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("all lower");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        fail('Should have failed as password does not conform to the policy.');
        done();
      }).catch((error) => {
        expect(error.code).toEqual(142);
        done();
      });
    })
  });

  it('signup should fail if password matches validatorPattern but fails validatorCallback', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorPattern: /[A-Z]+/,  // password should contain at least one UPPER case letter
        validatorCallback: value => false
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("oneUpper");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        fail('Should have failed as password does not conform to the policy.');
        done();
      }).catch((error) => {
        expect(error.code).toEqual(142);
        done();
      });
    })
  });

  it('signup should succeed if password conforms to both validatorPattern and validatorCallback', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorPattern: /[A-Z]+/,  // password should contain at least one digit
        validatorCallback: value => true
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("oneUpper");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        Parse.User.logOut().then(() => {
          Parse.User.logIn("user1", "oneUpper").then(function (user) {
            done();
          }).catch((err) => {
            jfail(err);
            fail("Should be able to login");
            done();
          });
        }).catch(error => {
          jfail(error);
          fail("logout should have succeeded");
          done();
        });
      }).catch((error) => {
        jfail(error);
        fail('Should have succeeded as password conforms to the policy.');
        done();
      });
    })
  });

  it('should reset password if new password conforms to password policy', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        requestp.get({
          uri: options.link,
          followRedirect: false,
          simple: false,
          resolveWithFullResponse: true
        }).then((response) => {
          expect(response.statusCode).toEqual(302);
          const re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=([a-zA-Z0-9]+)\&id=test\&username=user1/;
          const match = response.body.match(re);
          if (!match) {
            fail("should have a token");
            done();
            return;
          }
          const token = match[1];

          requestp.post({
            uri: "http://localhost:8378/1/apps/test/request_password_reset",
            body: `new_password=has2init&token=${token}&username=user1`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            followRedirect: false,
            simple: false,
            resolveWithFullResponse: true
          }).then((response) => {
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/password_reset_success.html?username=user1');

            Parse.User.logIn("user1", "has2init").then(function (user) {
              done();
            }).catch((err) => {
              jfail(err);
              fail("should login with new password");
              done();
            });
          }).catch((error)=> {
            jfail(error);
            fail("Failed to POST request password reset");
            done();
          });
        }).catch((error)=> {
          jfail(error);
          fail("Failed to get the reset link");
          done();
        });
      },
      sendMail: () => {
      }
    };
    reconfigureServer({
      appName: 'passwordPolicy',
      verifyUserEmails: false,
      emailAdapter: emailAdapter,
      passwordPolicy: {
        validatorPattern: /[0-9]+/  // password should contain at least one digit
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("has 1 digit");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user1@parse.com').catch((err) => {
          jfail(err);
          fail("Reset password request should not fail");
          done();
        });
      }).catch(error => {
        jfail(error);
        fail("signUp should not fail");
        done();
      });
    });
  });

  it('should fail to reset password if the new password does not conform to password policy', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        requestp.get({
          uri: options.link,
          followRedirect: false,
          simple: false,
          resolveWithFullResponse: true
        }).then((response) => {
          expect(response.statusCode).toEqual(302);
          const re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=([a-zA-Z0-9]+)\&id=test\&username=user1/;
          const match = response.body.match(re);
          if (!match) {
            fail("should have a token");
            done();
            return;
          }
          const token = match[1];

          requestp.post({
            uri: "http://localhost:8378/1/apps/test/request_password_reset",
            body: `new_password=hasnodigit&token=${token}&username=user1`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            followRedirect: false,
            simple: false,
            resolveWithFullResponse: true
          }).then((response) => {
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual(`Found. Redirecting to http://localhost:8378/1/apps/choose_password?username=user1&token=${token}&id=test&error=Password%20does%20not%20meet%20the%20Password%20Policy%20requirements.&app=passwordPolicy`);

            Parse.User.logIn("user1", "has 1 digit").then(function (user) {
              done();
            }).catch((err) => {
              jfail(err);
              fail("should login with old password");
              done();
            });
          }).catch((error) => {
            jfail(error);
            fail("Failed to POST request password reset");
            done();
          });
        }).catch((error) => {
          jfail(error);
          fail("Failed to get the reset link");
          done();
        });
      },
      sendMail: () => {
      }
    };
    reconfigureServer({
      appName: 'passwordPolicy',
      verifyUserEmails: false,
      emailAdapter: emailAdapter,
      passwordPolicy: {
        validatorPattern: /[0-9]+/  // password should contain at least one digit
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("has 1 digit");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user1@parse.com').catch((err) => {
          jfail(err);
          fail("Reset password request should not fail");
          done();
        });
      }).catch(error => {
        jfail(error);
        fail("signUp should not fail");
        done();
      });
    });
  });

  it('should fail if passwordPolicy.doNotAllowUsername is not a boolean value', (done) => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        doNotAllowUsername: 'no'
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      fail('passwordPolicy.doNotAllowUsername type test failed');
      done();
    }).catch(err => {
      expect(err).toEqual('passwordPolicy.doNotAllowUsername must be a boolean value.');
      done();
    });
  });

  it('signup should fail if password contains the username and is not allowed by policy', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorPattern: /[0-9]+/,
        doNotAllowUsername: true
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("@user11");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        fail('Should have failed as password contains username.');
        done();
      }).catch((error) => {
        expect(error.code).toEqual(142);
        done();
      });
    })
  });

  it('signup should succeed if password does not contain the username and is not allowed by policy', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        doNotAllowUsername: true
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("r@nd0m");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        done();
      }).catch((error) => {
        fail('Should have succeeded as password does not contain username.');
        done();
      });
    })
  });

  it('signup should succeed if password contains the username and it is allowed by policy', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validatorPattern: /[0-9]+/
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("user1");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        done();
      }).catch((error) => {
        fail('Should have succeeded as policy allows username in password.');
        done();
      });
    })
  });

  it('should fail to reset password if the new password contains username and not allowed by password policy', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        requestp.get({
          uri: options.link,
          followRedirect: false,
          simple: false,
          resolveWithFullResponse: true
        }).then((response) => {
          expect(response.statusCode).toEqual(302);
          const re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=([a-zA-Z0-9]+)\&id=test\&username=user1/;
          const match = response.body.match(re);
          if (!match) {
            fail("should have a token");
            done();
            return;
          }
          const token = match[1];

          requestp.post({
            uri: "http://localhost:8378/1/apps/test/request_password_reset",
            body: `new_password=xuser12&token=${token}&username=user1`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            followRedirect: false,
            simple: false,
            resolveWithFullResponse: true
          }).then((response) => {
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual(`Found. Redirecting to http://localhost:8378/1/apps/choose_password?username=user1&token=${token}&id=test&error=Password%20does%20not%20meet%20the%20Password%20Policy%20requirements.&app=passwordPolicy`);

            Parse.User.logIn("user1", "r@nd0m").then(function (user) {
              done();
            }).catch((err) => {
              jfail(err);
              fail("should login with old password");
              done();
            });

          }).catch((error) => {
            jfail(error);
            fail("Failed to POST request password reset");
            done();
          });
        }).catch((error) => {
          jfail(error);
          fail("Failed to get the reset link");
          done();
        });
      },
      sendMail: () => {
      }
    };
    reconfigureServer({
      appName: 'passwordPolicy',
      verifyUserEmails: false,
      emailAdapter: emailAdapter,
      passwordPolicy: {
        doNotAllowUsername: true
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("r@nd0m");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user1@parse.com').catch((err) => {
          jfail(err);
          fail("Reset password request should not fail");
          done();
        });
      }).catch(error => {
        jfail(error);
        fail("signUp should not fail");
        done();
      });
    });
  });

  it('should reset password even if the new password contains user name while the policy allows', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        requestp.get({
          uri: options.link,
          followRedirect: false,
          simple: false,
          resolveWithFullResponse: true
        }).then(response => {
          expect(response.statusCode).toEqual(302);
          const re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=([a-zA-Z0-9]+)\&id=test\&username=user1/;
          const match = response.body.match(re);
          if (!match) {
            fail("should have a token");
            done();
            return;
          }
          const token = match[1];

          requestp.post({
            uri: "http://localhost:8378/1/apps/test/request_password_reset",
            body: `new_password=uuser11&token=${token}&username=user1`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            followRedirect: false,
            simple: false,
            resolveWithFullResponse: true
          }).then(response => {
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/password_reset_success.html?username=user1');

            Parse.User.logIn("user1", "uuser11").then(function (user) {
              done();
            }).catch(err => {
              jfail(err);
              fail("should login with new password");
              done();
            });

          }).catch(error => {
            jfail(error);
            fail("Failed to POST request password reset");
          });
        }).catch(error => {
          jfail(error);
          fail("Failed to get the reset link");
        });
      },
      sendMail: () => {
      }
    };
    reconfigureServer({
      appName: 'passwordPolicy',
      verifyUserEmails: false,
      emailAdapter: emailAdapter,
      passwordPolicy: {
        validatorPattern: /[0-9]+/,
        doNotAllowUsername: false
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("has 1 digit");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user1@parse.com').catch((err) => {
          jfail(err);
          fail("Reset password request should not fail");
          done();
        });
      });
    }).catch(error => {
      jfail(error);
      fail("signUp should not fail");
      done();
    });
  });

  it('should fail if passwordPolicy.daysBeforeExpiry is not a number', done => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        daysBeforeExpiry: "not a number"
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      fail('passwordPolicy.daysBeforeExpiry "not a number" test failed');
      done();
    }).catch(err => {
      expect(err).toEqual('passwordPolicy.daysBeforeExpiry must be a positive number');
      done();
    });
  });

  it('should fail if passwordPolicy.daysBeforeExpiry is a negative number', done => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        daysBeforeExpiry: -100
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      fail('passwordPolicy.daysBeforeExpiry negative number test failed');
      done();
    }).catch(err => {
      expect(err).toEqual('passwordPolicy.daysBeforeExpiry must be a positive number');
      done();
    });
  });

  it('should succeed if logged in before password expires', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        daysBeforeExpiry: 1 // 1 day
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("user1");
      user.set('email', 'user1@parse.com');
      user.signUp().then((u) => {
        Parse.User.logIn("user1", "user1").then((user) => {
          done();
        }).catch((error) => {
          jfail(error);
          fail('Login should have succeeded before password expiry.');
          done();
        });
      }).catch((error) => {
        jfail(error);
        fail('Signup failed.');
        done();
      });
    })
  });

  it('should fail if logged in after password expires', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        daysBeforeExpiry: 0.5/(24*60*60) // 0.5 sec
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("user1");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        // wait for a bit more than the validity duration set
        setTimeout(() => {
          Parse.User.logIn("user1", "user1").then(() => {
            fail("logIn should have failed");
            done();
          }).catch((error) => {
            expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
            expect(error.message).toEqual('Your password has expired. Please reset your password.');
            done();
          });
        }, 1000);
      }).catch((error) => {
        jfail(error);
        fail('Signup failed.');
        done();
      });
    });
  });

  it('should apply password expiry policy to existing user upon first login after policy is enabled', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("user1");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        Parse.User.logOut().then(() => {
          reconfigureServer({
            appName: 'passwordPolicy',
            passwordPolicy: {
              daysBeforeExpiry: 0.5/(24*60*60) // 0.5 sec
            },
            publicServerURL: "http://localhost:8378/1"
          }).then(() => {
            Parse.User.logIn("user1", "user1").then((u) => {
              Parse.User.logOut().then(() => {
                // wait for a bit more than the validity duration set
                setTimeout(() => {
                  Parse.User.logIn("user1", "user1").then(() => {
                    fail("logIn should have failed");
                    done();
                  }).catch((error) => {
                    expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
                    expect(error.message).toEqual('Your password has expired. Please reset your password.');
                    done();
                  });
                }, 2000);
              }).catch(error => {
                jfail(error);
                fail("logout should have succeeded");
                done();
              });
            }).catch((error) => {
              jfail(error);
              fail('Login failed.');
              done();
            });
          });
        }).catch(error => {
          jfail(error);
          fail("logout should have succeeded");
          done();
        });
      }).catch((error) => {
        jfail(error);
        fail('Signup failed.');
        done();
      });
    });

  });

  it('should reset password timestamp when password is reset', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        requestp.get({
          uri: options.link,
          followRedirect: false,
          simple: false,
          resolveWithFullResponse: true
        }).then(response => {
          expect(response.statusCode).toEqual(302);
          const re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=([a-zA-Z0-9]+)\&id=test\&username=user1/;
          const match = response.body.match(re);
          if (!match) {
            fail("should have a token");
            done();
            return;
          }
          const token = match[1];

          requestp.post({
            uri: "http://localhost:8378/1/apps/test/request_password_reset",
            body: `new_password=uuser11&token=${token}&username=user1`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            followRedirect: false,
            simple: false,
            resolveWithFullResponse: true
          }).then(response => {
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/password_reset_success.html?username=user1');

            Parse.User.logIn("user1", "uuser11").then(function (user) {
              done();
            }).catch(err => {
              jfail(err);
              fail("should login with new password");
              done();
            });
          }).catch(error => {
            jfail(error);
            fail("Failed to POST request password reset");
          });
        }).catch(error => {
          jfail(error);
          fail("Failed to get the reset link");
        });
      },
      sendMail: () => {
      }
    };
    reconfigureServer({
      appName: 'passwordPolicy',
      emailAdapter: emailAdapter,
      passwordPolicy: {
        daysBeforeExpiry: 0.5/(24*60*60) // 0.5 sec
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("user1");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        // wait for a bit more than the validity duration set
        setTimeout(() => {
          Parse.User.logIn("user1", "user1").then(() => {
            fail("logIn should have failed");
            done();
          }).catch((error) => {
            expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
            expect(error.message).toEqual('Your password has expired. Please reset your password.');
            Parse.User.requestPasswordReset('user1@parse.com').catch((err) => {
              jfail(err);
              fail("Reset password request should not fail");
              done();
            });
          });
        }, 1000);
      }).catch((error) => {
        jfail(error);
        fail('Signup failed.');
        done();
      });
    });
  });

})
