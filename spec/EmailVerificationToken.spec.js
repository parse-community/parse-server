"use strict";

const MockEmailAdapterWithOptions = require('./MockEmailAdapterWithOptions');
const request = require('request');
const Config = require('../src/Config');

describe("Email Verification Token Expiration: ", () => {

  it('show the invalid link page, if the user clicks on the verify email link after the email verify token expires', done => {
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
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 0.5, // 0.5 second
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setUsername("testEmailVerifyTokenValidity");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(() => {
      // wait for 1 second - simulate user behavior to some extent
      setTimeout(() => {
        expect(sendEmailOptions).not.toBeUndefined();

        request.get(sendEmailOptions.link, {
            followRedirect: false,
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(302);
          expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
          done();
        });
      }, 1000);
    }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('emailVerified should set to false, if the user does not verify their email before the email verify token expires', done => {
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
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 0.5, // 0.5 second
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setUsername("testEmailVerifyTokenValidity");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(() => {
      // wait for 1 second - simulate user behavior to some extent
      setTimeout(() => {
        expect(sendEmailOptions).not.toBeUndefined();

        request.get(sendEmailOptions.link, {
            followRedirect: false,
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(302);
          user.fetch()
          .then(() => {
            expect(user.get('emailVerified')).toEqual(false);
            done();
          })
          .catch((err) => {
            jfail(error);
            done();
          });
        });
      }, 1000);
    }).catch((err) => {
      jfail(error);
      done();
    });
  });

  it('if user clicks on the email verify link before email verification token expiration then show the verify email success page', done => {
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
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setUsername("testEmailVerifyTokenValidity");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(() => {
      request.get(sendEmailOptions.link, {
          followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/verify_email_success.html?username=testEmailVerifyTokenValidity');
        done();
      });
    }).catch((err) => {
      jfail(error);
      done();
    });
  });

  it('if user clicks on the email verify link before email verification token expiration then emailVerified should be true', done => {
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
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setUsername("testEmailVerifyTokenValidity");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(() => {
      request.get(sendEmailOptions.link, {
          followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        user.fetch()
        .then(() => {
          expect(user.get('emailVerified')).toEqual(true);
          done();
        })
        .catch((err) => {
          jfail(error);
          done();
        });
      });
    }).catch((err) => {
      jfail(error);
      done();
    });
  });

  it('if user clicks on the email verify link before email verification token expiration then user should be able to login', done => {
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
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setUsername("testEmailVerifyTokenValidity");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    }).then(() => {
      request.get(sendEmailOptions.link, {
          followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        Parse.User.logIn("testEmailVerifyTokenValidity", "expiringToken")
        .then(user => {
          expect(typeof user).toBe('object');
          expect(user.get('emailVerified')).toBe(true);
          done();
        })
        .catch((error) => {
          jfail(error);
          done();
        });
      });
    }).catch((err) => {
      jfail(error);
      done();
    });
  });

  it('sets the _email_verify_token_expires_at and _email_verify_token fields after user SignUp', done => {
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
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1'
    })
    .then(() => {
      user.setUsername('sets_email_verify_token_expires_at');
      user.setPassword('expiringToken');
      user.set('email', 'user@parse.com');
      return user.signUp();
    })
    .then(() => {
      let config = new Config('test');
      return config.database.find('_User', {username: 'sets_email_verify_token_expires_at'});
    })
    .then(results => {
      expect(results.length).toBe(1);
      let user = results[0];
      expect(typeof user).toBe('object');
      expect(user.emailVerified).toEqual(false);
      expect(typeof user._email_verify_token).toBe('string');
      expect(typeof user._email_verify_token_expires_at).toBe('object');
      done();
    })
    .catch(error => {
      jfail(error);
      done();
    });
  });

  it('unsets the _email_verify_token_expires_at and _email_verify_token fields in the User class if email verification is successful', done => {
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
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setUsername("unsets_email_verify_token_expires_at");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    })
    .then(() => {
      request.get(sendEmailOptions.link, {
          followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        let config = new Config('test');
        return config.database.find('_User', {username: 'unsets_email_verify_token_expires_at'}).then((results) => {
          expect(results.length).toBe(1);
          return results[0];
        })
        .then(user => {
          expect(typeof user).toBe('object');
          expect(user.emailVerified).toEqual(true);
          expect(typeof user._email_verify_token).toBe('undefined');
          expect(typeof user._email_verify_token_expires_at).toBe('undefined');
          done();
        })
        .catch(error => {
          jfail(error);
          done();
        });
      });
    })
    .catch(error => {
      jfail(error);
      done();
    });
  });

  it('clicking on the email verify link by an email VERIFIED user that was setup before enabling the expire email verify token should show an invalid link', done => {
    var user = new Parse.User();
    var sendEmailOptions;
    var emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    }
    var serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    };

    // setup server WITHOUT enabling the expire email verify token flag
    reconfigureServer(serverConfig)
    .then(() => {
      user.setUsername("testEmailVerifyTokenValidity");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        request.get(sendEmailOptions.link, { followRedirect: false, })
        .on('error', error => reject(error))
        .on('response', (response) => {
          expect(response.statusCode).toEqual(302);
          resolve(user.fetch());
        });
      });
    })
    .then(() => {
      expect(user.get('emailVerified')).toEqual(true);
      // RECONFIGURE the server i.e., ENABLE the expire email verify token flag
      serverConfig.emailVerifyTokenValidityDuration = 5; // 5 seconds
      return reconfigureServer(serverConfig);
    })
    .then(() => {
      request.get(sendEmailOptions.link, {
          followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
        done();
      });
    })
    .catch((err) => {
      jfail(error);
      done();
    });
  });

  it('clicking on the email verify link by an email UNVERIFIED user that was setup before enabling the expire email verify token should show an invalid link', done => {
    var user = new Parse.User();
    var sendEmailOptions;
    var emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    }
    var serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    };

    // setup server WITHOUT enabling the expire email verify token flag
    reconfigureServer(serverConfig)
    .then(() => {
      user.setUsername("testEmailVerifyTokenValidity");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    })
    .then(() => {
      // just get the user again - DO NOT email verify the user
      return user.fetch();
    })
    .then(() => {
      expect(user.get('emailVerified')).toEqual(false);
      // RECONFIGURE the server i.e., ENABLE the expire email verify token flag
      serverConfig.emailVerifyTokenValidityDuration = 5; // 5 seconds
      return reconfigureServer(serverConfig);
    })
    .then(() => {
      request.get(sendEmailOptions.link, {
          followRedirect: false,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(302);
        expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
        done();
      });
    })
    .catch((err) => {
      jfail(error);
      done();
    });
  });

  it('setting the email on the user should set a new email verification token and new expiration date for the token when expire email verify token flag is set', done => {

    let db;

    let user = new Parse.User();
    let userBeforeEmailReset;

    let sendEmailOptions;
    let emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {}
    };
    let serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: "http://localhost:8378/1"
    };

    reconfigureServer(serverConfig)
    .then(() => {
      user.setUsername("newEmailVerifyTokenOnEmailReset");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    })
    .then(() => {
      let config = new Config('test');
      return config.database.find('_User', {username: 'newEmailVerifyTokenOnEmailReset'}).then((results) => {
        return results[0];
      });
    })
    .then(userFromDb => {
      expect(typeof userFromDb).toBe('object');
      userBeforeEmailReset = userFromDb;

      // trigger another token generation by setting the email
      user.set('email', 'user@parse.com');
      return new Promise((resolve, reject) => {
        // wait for half a sec to get a new expiration time
        setTimeout( () => resolve(user.save()), 500 );
      });
    })
    .then(() => {
      let config = new Config('test');
      return config.database.find('_User', {username: 'newEmailVerifyTokenOnEmailReset'}).then((results) => {
        return results[0];
      });
    })
    .then(userAfterEmailReset => {
      expect(typeof userAfterEmailReset).toBe('object');
      expect(userBeforeEmailReset._email_verify_token).not.toEqual(userAfterEmailReset._email_verify_token);
      expect(userBeforeEmailReset._email_verify_token_expires_at).not.toEqual(userAfterEmailReset.__email_verify_token_expires_at);
      done();
    })
    .catch((err) => {
      jfail(error);
      done();
    });
  });

  it('client should not see the _email_verify_token_expires_at field', done => {
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
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: "http://localhost:8378/1"
    })
    .then(() => {
      user.setUsername("testEmailVerifyTokenValidity");
      user.setPassword("expiringToken");
      user.set('email', 'user@parse.com');
      return user.signUp();
    })
    .then(() => {

      user.fetch()
      .then(() => {
        expect(user.get('emailVerified')).toEqual(false);
        expect(typeof user.get('_email_verify_token_expires_at')).toBe('undefined');
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });

    }).catch((err) => {
      jfail(error);
      done();
    });
  });

})
