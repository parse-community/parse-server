'use strict';

const Config = require('../lib/Config');
const request = require('../lib/request');

describe('Email Verification Token Expiration: ', () => {
  it('show the invalid verification link page, if the user clicks on the verify email link after the email verify token expires', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 0.5, // 0.5 second
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        // wait for 1 second - simulate user behavior to some extent
        setTimeout(() => {
          expect(sendEmailOptions).not.toBeUndefined();

          request({
            url: sendEmailOptions.link,
            followRedirects: false,
          }).then(response => {
            expect(response.status).toEqual(302);
            expect(response.text).toEqual(
              'Found. Redirecting to http://localhost:8378/1/apps/invalid_verification_link.html?username=testEmailVerifyTokenValidity&appId=test'
            );
            done();
          });
        }, 1000);
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('emailVerified should set to false, if the user does not verify their email before the email verify token expires', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 0.5, // 0.5 second
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        // wait for 1 second - simulate user behavior to some extent
        setTimeout(() => {
          expect(sendEmailOptions).not.toBeUndefined();

          request({
            url: sendEmailOptions.link,
            followRedirects: false,
          }).then(response => {
            expect(response.status).toEqual(302);
            user
              .fetch()
              .then(() => {
                expect(user.get('emailVerified')).toEqual(false);
                done();
              })
              .catch(error => {
                jfail(error);
                done();
              });
          });
        }, 1000);
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('if user clicks on the email verify link before email verification token expiration then show the verify email success page', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
          expect(response.text).toEqual(
            'Found. Redirecting to http://localhost:8378/1/apps/verify_email_success.html?username=testEmailVerifyTokenValidity'
          );
          done();
        });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('if user clicks on the email verify link before email verification token expiration then emailVerified should be true', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
          user
            .fetch()
            .then(() => {
              expect(user.get('emailVerified')).toEqual(true);
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

  it('if user clicks on the email verify link before email verification token expiration then user should be able to login', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
          Parse.User.logIn('testEmailVerifyTokenValidity', 'expiringToken')
            .then(user => {
              expect(typeof user).toBe('object');
              expect(user.get('emailVerified')).toBe(true);
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

  it('sets the _email_verify_token_expires_at and _email_verify_token fields after user SignUp', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('sets_email_verify_token_expires_at');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        const config = Config.get('test');
        return config.database.find('_User', {
          username: 'sets_email_verify_token_expires_at',
        });
      })
      .then(results => {
        expect(results.length).toBe(1);
        const user = results[0];
        expect(typeof user).toBe('object');
        expect(user.emailVerified).toEqual(false);
        expect(typeof user._email_verify_token).toBe('string');
        expect(typeof user._email_verify_token_expires_at).toBe('object');
        expect(sendEmailOptions).toBeDefined();
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('unsets the _email_verify_token_expires_at and _email_verify_token fields in the User class if email verification is successful', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('unsets_email_verify_token_expires_at');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
          const config = Config.get('test');
          return config.database
            .find('_User', {
              username: 'unsets_email_verify_token_expires_at',
            })
            .then(results => {
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

  it('clicking on the email verify link by an email VERIFIED user that was setup before enabling the expire email verify token should show email verify email success', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    };

    // setup server WITHOUT enabling the expire email verify token flag
    reconfigureServer(serverConfig)
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        return request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
          return user.fetch();
        });
      })
      .then(() => {
        expect(user.get('emailVerified')).toEqual(true);
        // RECONFIGURE the server i.e., ENABLE the expire email verify token flag
        serverConfig.emailVerifyTokenValidityDuration = 5; // 5 seconds
        return reconfigureServer(serverConfig);
      })
      .then(() => {
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
          expect(response.text).toEqual(
            'Found. Redirecting to http://localhost:8378/1/apps/verify_email_success.html?username=testEmailVerifyTokenValidity'
          );
          done();
        });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('clicking on the email verify link by an email UNVERIFIED user that was setup before enabling the expire email verify token should show invalid verficiation link page', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    };

    // setup server WITHOUT enabling the expire email verify token flag
    reconfigureServer(serverConfig)
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
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
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
          expect(response.text).toEqual(
            'Found. Redirecting to http://localhost:8378/1/apps/invalid_verification_link.html?username=testEmailVerifyTokenValidity&appId=test'
          );
          done();
        });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('setting the email on the user should set a new email verification token and new expiration date for the token when expire email verify token flag is set', done => {
    const user = new Parse.User();
    let userBeforeEmailReset;

    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    };

    reconfigureServer(serverConfig)
      .then(() => {
        user.setUsername('newEmailVerifyTokenOnEmailReset');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        const config = Config.get('test');
        return config.database
          .find('_User', { username: 'newEmailVerifyTokenOnEmailReset' })
          .then(results => {
            return results[0];
          });
      })
      .then(userFromDb => {
        expect(typeof userFromDb).toBe('object');
        userBeforeEmailReset = userFromDb;

        // trigger another token generation by setting the email
        user.set('email', 'user@parse.com');
        return new Promise(resolve => {
          // wait for half a sec to get a new expiration time
          setTimeout(() => resolve(user.save()), 500);
        });
      })
      .then(() => {
        const config = Config.get('test');
        return config.database
          .find('_User', { username: 'newEmailVerifyTokenOnEmailReset' })
          .then(results => {
            return results[0];
          });
      })
      .then(userAfterEmailReset => {
        expect(typeof userAfterEmailReset).toBe('object');
        expect(userBeforeEmailReset._email_verify_token).not.toEqual(
          userAfterEmailReset._email_verify_token
        );
        expect(userBeforeEmailReset._email_verify_token_expires_at).not.toEqual(
          userAfterEmailReset._email_verify_token_expires_at
        );
        expect(sendEmailOptions).toBeDefined();
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('should send a new verification email when a resend is requested and the user is UNVERIFIED', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    let userBeforeRequest;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('resends_verification_token');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        const config = Config.get('test');
        return config.database
          .find('_User', { username: 'resends_verification_token' })
          .then(results => {
            return results[0];
          });
      })
      .then(newUser => {
        // store this user before we make our email request
        userBeforeRequest = newUser;

        expect(sendVerificationEmailCallCount).toBe(1);

        return request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: {
            email: 'user@parse.com',
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(response => {
        expect(response.status).toBe(200);
        expect(sendVerificationEmailCallCount).toBe(2);
        expect(sendEmailOptions).toBeDefined();

        // query for this user again
        const config = Config.get('test');
        return config.database
          .find('_User', { username: 'resends_verification_token' })
          .then(results => {
            return results[0];
          });
      })
      .then(userAfterRequest => {
        // verify that our token & expiration has been changed for this new request
        expect(typeof userAfterRequest).toBe('object');
        expect(userBeforeRequest._email_verify_token).not.toEqual(
          userAfterRequest._email_verify_token
        );
        expect(userBeforeRequest._email_verify_token_expires_at).not.toEqual(
          userAfterRequest._email_verify_token_expires_at
        );
        done();
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('should throw with invalid emailVerifyTokenReuseIfValid', async done => {
    const sendEmailOptions = [];
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        sendEmailOptions.push(options);
      },
      sendMail: () => {},
    };
    try {
      await reconfigureServer({
        appName: 'passwordPolicy',
        verifyUserEmails: true,
        emailAdapter: emailAdapter,
        emailVerifyTokenValidityDuration: 5 * 60, // 5 minutes
        emailVerifyTokenReuseIfValid: [],
        publicServerURL: 'http://localhost:8378/1',
      });
      fail('should have thrown.');
    } catch (e) {
      expect(e).toBe('emailVerifyTokenReuseIfValid must be a boolean value');
    }
    try {
      await reconfigureServer({
        appName: 'passwordPolicy',
        verifyUserEmails: true,
        emailAdapter: emailAdapter,
        emailVerifyTokenReuseIfValid: true,
        publicServerURL: 'http://localhost:8378/1',
      });
      fail('should have thrown.');
    } catch (e) {
      expect(e).toBe(
        'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration'
      );
    }
    done();
  });

  it('should match codes with emailVerifyTokenReuseIfValid', async done => {
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5 * 60, // 5 minutes
      publicServerURL: 'http://localhost:8378/1',
      emailVerifyTokenReuseIfValid: true,
    });
    const user = new Parse.User();
    user.setUsername('resends_verification_token');
    user.setPassword('expiringToken');
    user.set('email', 'user@example.com');
    await user.signUp();

    const config = Config.get('test');
    const [userBeforeRequest] = await config.database.find('_User', {
      username: 'resends_verification_token',
    });
    // store this user before we make our email request
    expect(sendVerificationEmailCallCount).toBe(1);
    await new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, 1000);
    });
    const response = await request({
      url: 'http://localhost:8378/1/verificationEmailRequest',
      method: 'POST',
      body: {
        email: 'user@example.com',
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    });
    expect(response.status).toBe(200);
    expect(sendVerificationEmailCallCount).toBe(2);
    expect(sendEmailOptions).toBeDefined();

    const [userAfterRequest] = await config.database.find('_User', {
      username: 'resends_verification_token',
    });

    // verify that our token & expiration has been changed for this new request
    expect(typeof userAfterRequest).toBe('object');
    expect(userBeforeRequest._email_verify_token).toEqual(userAfterRequest._email_verify_token);
    expect(userBeforeRequest._email_verify_token_expires_at).toEqual(
      userAfterRequest._email_verify_token_expires_at
    );
    done();
  });

  it('should not send a new verification email when a resend is requested and the user is VERIFIED', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('no_new_verification_token_once_verified');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        return request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
        });
      })
      .then(() => {
        expect(sendVerificationEmailCallCount).toBe(1);

        return request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: {
            email: 'user@parse.com',
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        })
          .then(fail, res => res)
          .then(response => {
            expect(response.status).toBe(400);
            expect(sendVerificationEmailCallCount).toBe(1);
            done();
          });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('should not send a new verification email if this user does not exist', done => {
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        return request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: {
            email: 'user@parse.com',
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        })
          .then(fail)
          .catch(response => response)
          .then(response => {
            expect(response.status).toBe(400);
            expect(sendVerificationEmailCallCount).toBe(0);
            expect(sendEmailOptions).not.toBeDefined();
            done();
          });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('should fail if no email is supplied', done => {
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: {},
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        })
          .then(fail, response => response)
          .then(response => {
            expect(response.status).toBe(400);
            expect(response.data.code).toBe(Parse.Error.EMAIL_MISSING);
            expect(response.data.error).toBe('you must provide an email');
            expect(sendVerificationEmailCallCount).toBe(0);
            expect(sendEmailOptions).not.toBeDefined();
            done();
          });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('should fail if email is not a string', done => {
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 3 },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        })
          .then(fail, res => res)
          .then(response => {
            expect(response.status).toBe(400);
            expect(response.data.code).toBe(Parse.Error.INVALID_EMAIL_ADDRESS);
            expect(response.data.error).toBe('you must provide a valid email string');
            expect(sendVerificationEmailCallCount).toBe(0);
            expect(sendEmailOptions).not.toBeDefined();
            done();
          });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('client should not see the _email_verify_token_expires_at field', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        user
          .fetch()
          .then(() => {
            expect(user.get('emailVerified')).toEqual(false);
            expect(typeof user.get('_email_verify_token_expires_at')).toBe('undefined');
            expect(sendEmailOptions).toBeDefined();
            done();
          })
          .catch(error => {
            jfail(error);
            done();
          });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('emailVerified should be set to false after changing from an already verified email', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setUsername('testEmailVerifyTokenValidity');
        user.setPassword('expiringToken');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(302);
          Parse.User.logIn('testEmailVerifyTokenValidity', 'expiringToken')
            .then(user => {
              expect(typeof user).toBe('object');
              expect(user.get('emailVerified')).toBe(true);

              user.set('email', 'newEmail@parse.com');
              return user.save();
            })
            .then(() => user.fetch())
            .then(user => {
              expect(typeof user).toBe('object');
              expect(user.get('email')).toBe('newEmail@parse.com');
              expect(user.get('emailVerified')).toBe(false);

              request({
                url: sendEmailOptions.link,
                followRedirects: false,
              }).then(response => {
                expect(response.status).toEqual(302);
                done();
              });
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
});
