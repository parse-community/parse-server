'use strict';

const { PublicAPIRouter, pages } = require('../lib/Routers/PublicAPIRouter');
const MockEmailAdapterWithOptions = require('./MockEmailAdapterWithOptions');
const request = require('../lib/request');
const Config = require('../lib/Config');
const Utils = require('../lib/Utils');

describe('Custom Pages, Email Verification, Password Reset', () => {
  it('should set the custom pages', done => {
    reconfigureServer({
      appName: 'unused',
      customPages: {
        invalidLink: 'myInvalidLink',
        verifyEmailSuccess: 'myVerifyEmailSuccess',
        choosePassword: 'myChoosePassword',
        passwordResetSuccess: 'myPasswordResetSuccess',
        parseFrameURL: 'http://example.com/handle-parse-iframe',
      },
      publicServerURL: 'https://my.public.server.com/1',
    }).then(() => {
      const config = Config.get('test');
      expect(config.invalidLinkURL).toEqual('myInvalidLink');
      expect(config.verifyEmailSuccessURL).toEqual('myVerifyEmailSuccess');
      expect(config.choosePasswordURL).toEqual('myChoosePassword');
      expect(config.passwordResetSuccessURL).toEqual('myPasswordResetSuccess');
      expect(config.parseFrameURL).toEqual('http://example.com/handle-parse-iframe');
      expect(config.verifyEmailURL).toEqual(
        'https://my.public.server.com/1/apps/test/verify_email'
      );
      expect(config.requestResetPasswordURL).toEqual(
        'https://my.public.server.com/1/apps/test/request_password_reset'
      );
      done();
    });
  });

  it('sends verification email if email verification is enabled', done => {
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(async () => {
      spyOn(emailAdapter, 'sendVerificationEmail');
      const user = new Parse.User();
      user.setPassword('asdf');
      user.setUsername('zxcv');
      user.setEmail('testIfEnabled@parse.com');
      await user.signUp();
      expect(emailAdapter.sendVerificationEmail).toHaveBeenCalled();
      user.fetch().then(() => {
        expect(user.get('emailVerified')).toEqual(false);
        done();
      });
    });
  });

  it('does not send verification email when verification is enabled and email is not set', done => {
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(async () => {
      spyOn(emailAdapter, 'sendVerificationEmail');
      const user = new Parse.User();
      user.setPassword('asdf');
      user.setUsername('zxcv');
      await user.signUp();
      expect(emailAdapter.sendVerificationEmail).not.toHaveBeenCalled();
      user.fetch().then(() => {
        expect(user.get('emailVerified')).toEqual(undefined);
        done();
      });
    });
  });

  it('does send a validation email when updating the email', done => {
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(async () => {
      spyOn(emailAdapter, 'sendVerificationEmail');
      const user = new Parse.User();
      user.setPassword('asdf');
      user.setUsername('zxcv');
      await user.signUp();
      expect(emailAdapter.sendVerificationEmail).not.toHaveBeenCalled();
      user
        .fetch()
        .then(user => {
          user.set('email', 'testWhenUpdating@parse.com');
          return user.save();
        })
        .then(user => {
          return user.fetch();
        })
        .then(() => {
          expect(user.get('emailVerified')).toEqual(false);
          // Wait as on update email, we need to fetch the username
          setTimeout(function () {
            expect(emailAdapter.sendVerificationEmail).toHaveBeenCalled();
            done();
          }, 200);
        });
    });
  });

  it('does send a validation email with valid verification link when updating the email', async done => {
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };
    await reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    });
    spyOn(emailAdapter, 'sendVerificationEmail').and.callFake(options => {
      expect(options.link).not.toBeNull();
      expect(options.link).not.toMatch(/token=undefined/);
      Promise.resolve();
    });
    const user = new Parse.User();
    user.setPassword('asdf');
    user.setUsername('zxcv');
    await user.signUp();
    expect(emailAdapter.sendVerificationEmail).not.toHaveBeenCalled();
    await user.fetch();
    user.set('email', 'testValidLinkWhenUpdating@parse.com');
    await user.save();
    await user.fetch();
    expect(user.get('emailVerified')).toEqual(false);
    // Wait as on update email, we need to fetch the username
    setTimeout(function () {
      expect(emailAdapter.sendVerificationEmail).toHaveBeenCalled();
      done();
    }, 200);
  });

  it('does send with a simple adapter', done => {
    let calls = 0;
    const emailAdapter = {
      sendMail: function (options) {
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
      },
    };
    reconfigureServer({
      appName: 'My Cool App',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(async () => {
      const user = new Parse.User();
      user.setPassword('asdf');
      user.setUsername('zxcv');
      user.set('email', 'testSendSimpleAdapter@parse.com');
      await user.signUp();
      expect(calls).toBe(1);
      user
        .fetch()
        .then(user => {
          return user.save();
        })
        .then(() => {
          return Parse.User.requestPasswordReset('testSendSimpleAdapter@parse.com').catch(() => {
            fail('Should not fail requesting a password');
            done();
          });
        })
        .then(() => {
          expect(calls).toBe(2);
          done();
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
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('zxcv');
        user.set('email', 'testInvalidConfig@parse.com');
        user
          .signUp(null)
          .then(user => {
            expect(user.getSessionToken()).toBe(undefined);
            return Parse.User.logIn('zxcv', 'asdf');
          })
          .then(
            () => {
              fail('login should have failed');
              done();
            },
            error => {
              expect(error.message).toEqual('User email is not verified.');
              done();
            }
          );
      })
      .catch(error => {
        fail(JSON.stringify(error));
        done();
      });
  });

  it('allows user to login only after user clicks on the link to confirm email address if preventLoginWithUnverifiedEmail is set to true', done => {
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
      appName: 'emailing app',
      verifyUserEmails: true,
      preventLoginWithUnverifiedEmail: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setPassword('other-password');
        user.setUsername('user');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        expect(sendEmailOptions).not.toBeUndefined();
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(200);
          expect(response.text).toContain('Successfully verified your email');
          expect(response.text).toContain('account: user');
          user
            .fetch()
            .then(
              () => {
                expect(user.get('emailVerified')).toEqual(true);

                Parse.User.logIn('user', 'other-password').then(
                  user => {
                    expect(typeof user).toBe('object');
                    expect(user.get('emailVerified')).toBe(true);
                    done();
                  },
                  () => {
                    fail('login should have succeeded');
                    done();
                  }
                );
              },
              err => {
                jfail(err);
                fail('this should not fail');
                done();
              }
            )
            .catch(err => {
              jfail(err);
              done();
            });
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
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('zxcv');
        user.set('email', 'testInvalidConfig@parse.com');
        user
          .signUp(null)
          .then(() => Parse.User.logIn('zxcv', 'asdf'))
          .then(
            user => {
              expect(typeof user).toBe('object');
              expect(user.get('emailVerified')).toBe(false);
              done();
            },
            () => {
              fail('login should have succeeded');
              done();
            }
          );
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
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('zxcv');
        user.set('email', 'testInvalidConfig@parse.com');
        user
          .signUp(null)
          .then(() => Parse.User.requestPasswordReset('testInvalidConfig@parse.com'))
          .then(
            () => {
              fail('sending password reset email should not have succeeded');
              done();
            },
            error => {
              expect(error.message).toEqual(
                'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.'
              );
              done();
            }
          );
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
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('zxcv');
        user.set('email', 'testInvalidConfig@parse.com');
        user
          .signUp(null)
          .then(() => Parse.User.requestPasswordReset('testInvalidConfig@parse.com'))
          .then(
            () => {
              fail('sending password reset email should not have succeeded');
              done();
            },
            error => {
              expect(error.message).toEqual(
                'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.'
              );
              done();
            }
          );
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
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('zxcv');
        user.set('email', 'testInvalidConfig@parse.com');
        user
          .signUp(null)
          .then(() => Parse.User.requestPasswordReset('testInvalidConfig@parse.com'))
          .then(
            () => {
              fail('sending password reset email should not have succeeded');
              done();
            },
            error => {
              expect(error.message).toEqual(
                'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.'
              );
              done();
            }
          );
      })
      .catch(error => {
        fail(JSON.stringify(error));
        done();
      });
  });

  it('succeeds sending a password reset email if appName, publicServerURL, and email adapter are provided', done => {
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
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('zxcv');
        user.set('email', 'testInvalidConfig@parse.com');
        user
          .signUp(null)
          .then(() => Parse.User.requestPasswordReset('testInvalidConfig@parse.com'))
          .then(
            () => {
              done();
            },
            error => {
              done(error);
            }
          );
      })
      .catch(error => {
        fail(JSON.stringify(error));
        done();
      });
  });

  it('succeeds sending a password reset username if appName, publicServerURL, and email adapter are provided', done => {
    const adapter = MockEmailAdapterWithOptions({
      fromAddress: 'parse@example.com',
      apiKey: 'k',
      domain: 'd',
      sendMail: function (options) {
        expect(options.to).toEqual('testValidConfig@parse.com');
        return Promise.resolve();
      },
    });

    // delete that handler to force using the default
    delete adapter.sendPasswordResetEmail;

    spyOn(adapter, 'sendMail').and.callThrough();
    reconfigureServer({
      appName: 'coolapp',
      publicServerURL: 'http://localhost:1337/1',
      emailAdapter: adapter,
    })
      .then(() => {
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('testValidConfig@parse.com');
        user
          .signUp(null)
          .then(() => Parse.User.requestPasswordReset('testValidConfig@parse.com'))
          .then(
            () => {
              expect(adapter.sendMail).toHaveBeenCalled();
              done();
            },
            error => {
              done(error);
            }
          );
      })
      .catch(error => {
        fail(JSON.stringify(error));
        done();
      });
  });

  it('does not send verification email if email verification is disabled', done => {
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };
    reconfigureServer({
      appName: 'unused',
      publicServerURL: 'http://localhost:1337/1',
      verifyUserEmails: false,
      emailAdapter: emailAdapter,
    }).then(async () => {
      spyOn(emailAdapter, 'sendVerificationEmail');
      const user = new Parse.User();
      user.setPassword('asdf');
      user.setUsername('zxcv');
      await user.signUp();
      await user.fetch();
      expect(emailAdapter.sendVerificationEmail.calls.count()).toEqual(0);
      expect(user.get('emailVerified')).toEqual(undefined);
      done();
    });
  });

  it('receives the app name and user in the adapter', done => {
    let emailSent = false;
    const emailAdapter = {
      sendVerificationEmail: options => {
        expect(options.appName).toEqual('emailing app');
        expect(options.user.get('email')).toEqual('user@parse.com');
        emailSent = true;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(async () => {
      const user = new Parse.User();
      user.setPassword('asdf');
      user.setUsername('zxcv');
      user.set('email', 'user@parse.com');
      await user.signUp();
      expect(emailSent).toBe(true);
      done();
    });
  });

  it('when you click the link in the email it sets emailVerified to true and redirects you', done => {
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
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        user.setPassword('other-password');
        user.setUsername('exampleUsername');
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(() => {
        expect(sendEmailOptions).not.toBeUndefined();
        request({
          url: sendEmailOptions.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(200);
          expect(response.text).toContain('Successfully verified your email');
          expect(response.text).toContain('exampleUsername');
          user
            .fetch()
            .then(
              () => {
                expect(user.get('emailVerified')).toEqual(true);
                done();
              },
              err => {
                jfail(err);
                fail('this should not fail');
                done();
              }
            )
            .catch(err => {
              jfail(err);
              done();
            });
        });
      });
  });

  it('redirects you to invalid link if you try to verify email incorrectly', done => {
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {},
      },
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      request({
        url: 'http://localhost:8378/1/apps/test/verify_email',
        followRedirects: false,
      }).then(response => {
        expect(response.status).toEqual(200);
        expect(response.text).toContain('Invalid Link');
        done();
      });
    });
  });

  it('redirects you to invalid verification link page if you try to validate a nonexistant users email', done => {
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {},
      },
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      request({
        url:
          'http://localhost:8378/1/apps/test/verify_email?token=exampleToken&username=exampleUsername',
        followRedirects: false,
      }).then(response => {
        expect(response.status).toEqual(200);
        expect(response.text).toContain('value="exampleUsername"');
        expect(response.text).toContain('action="/apps/test/resend_verification_email"');
        done();
      });
    });
  });

  it('redirects you to link send fail page if you try to resend a link for a nonexistant user', done => {
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {},
      },
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      request({
        url: 'http://localhost:8378/1/apps/test/resend_verification_email',
        method: 'POST',
        followRedirects: false,
        body: {
          username: 'exampleUsername',
        },
      }).then(response => {
        expect(response.status).toEqual(303);
        expect(response.text).toEqual(
          'Found. Redirecting to http://localhost:8378/apps/link_send_fail.html'
        );
        done();
      });
    });
  });

  it('does not update email verified if you use an invalid token', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => {
        request({
          url:
            'http://localhost:8378/1/apps/test/verify_email?token=invalidToken&username=exampleUsername',
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(200);
          expect(response.text).toContain('value="exampleUsername"');
          expect(response.text).toContain('action="/apps/test/resend_verification_email"');
          user.fetch().then(() => {
            expect(user.get('emailVerified')).toEqual(false);
            done();
          });
        });
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'ExampleApp',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      user.setPassword('examplePassword');
      user.setUsername('exampleUsername');
      user.set('email', 'user@parse.com');
      user.signUp(null, {
        success: () => {},
        error: function () {
          fail('Failed to save user');
          done();
        },
      });
    });
  });

  it('should send a password reset link', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        request({
          url: options.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(200);
          expect(response.text).toContain('ExampleApp');
          expect(response.text).toContain('exampleUsername');
          expect(response.text).toContain(
            'http://localhost:8378/1/apps/test/request_password_reset'
          );
          done();
        });
      },
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'ExampleApp',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      user.setPassword('examplePassword');
      user.setUsername('exampleUsername');
      user.set('email', 'user@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user@parse.com', {
          error: err => {
            jfail(err);
            fail('Should not fail requesting a password');
            done();
          },
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
        sendMail: () => {},
      },
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      request({
        url:
          'http://localhost:8378/1/apps/test/request_password_reset?token=asdfasdf&username=sadfasga',
        followRedirects: false,
      }).then(response => {
        expect(response.status).toEqual(200);
        expect(response.text).toContain('Invalid Link');
        done();
      });
    });
  });

  it('should programmatically reset password', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        request({
          url: options.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(200);
          expect(response.text).toContain(
            'http://localhost:8378/1/apps/test/request_password_reset'
          );

          const token = response.headers['x-parse-page-param-token'];
          if (!token) {
            fail('should have a token');
            done();
            return;
          }

          request({
            url: 'http://localhost:8378/1/apps/test/request_password_reset',
            method: 'POST',
            body: { new_password: 'hello', token, username: 'zxcv' },
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            followRedirects: false,
          }).then(response => {
            expect(response.status).toEqual(200);
            expect(response.text).toContain('Your password has been updated.');

            Parse.User.logIn('zxcv', 'hello').then(
              function () {
                const config = Config.get('test');
                config.database.adapter
                  .find('_User', { fields: {} }, { username: 'zxcv' }, { limit: 1 })
                  .then(results => {
                    // _perishable_token should be unset after reset password
                    expect(results.length).toEqual(1);
                    expect(results[0]['_perishable_token']).toEqual(undefined);
                    done();
                  });
              },
              err => {
                jfail(err);
                fail('should login with new password');
                done();
              }
            );
          });
        });
      },
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      user.setPassword('asdf');
      user.setUsername('zxcv');
      user.set('email', 'user@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user@parse.com', {
          error: err => {
            jfail(err);
            fail('Should not fail');
            done();
          },
        });
      });
    });
  });

  it('should redirect with username encoded on success page', done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        request({
          url: options.link,
          followRedirects: false,
        }).then(response => {
          expect(response.status).toEqual(200);

          const token = response.headers['x-parse-page-param-token'];
          if (!token) {
            fail('should have a token');
            done();
            return;
          }

          request({
            url: 'http://localhost:8378/1/apps/test/request_password_reset',
            method: 'POST',
            body: { new_password: 'hello', token, username: 'zxcv+1' },
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            followRedirects: false,
          }).then(response => {
            expect(response.status).toEqual(200);
            expect(response.text).toContain('Your password has been updated.');
            done();
          });
        });
      },
      sendMail: () => {},
    };
    reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      user.setPassword('asdf');
      user.setUsername('zxcv+1');
      user.set('email', 'user@parse.com');
      user.signUp().then(() => {
        Parse.User.requestPasswordReset('user@parse.com', {
          error: err => {
            jfail(err);
            fail('Should not fail');
            done();
          },
        });
      });
    });
  });

  it('should programmatically reset password on ajax request', async done => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: async options => {
        const response = await request({
          url: options.link,
          followRedirects: false,
        });
        expect(response.status).toEqual(200);

        const token = response.headers['x-parse-page-param-token'];
        if (!token) {
          fail('should have a token');
          return;
        }

        const resetResponse = await request({
          url: 'http://localhost:8378/1/apps/test/request_password_reset',
          method: 'POST',
          body: { new_password: 'hello', token, username: 'zxcv' },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
          },
          followRedirects: false,
        });
        expect(resetResponse.status).toEqual(200);
        expect(resetResponse.text).toEqual('"Password successfully reset"');

        await Parse.User.logIn('zxcv', 'hello');
        const config = Config.get('test');
        const results = await config.database.adapter.find(
          '_User',
          { fields: {} },
          { username: 'zxcv' },
          { limit: 1 }
        );
        // _perishable_token should be unset after reset password
        expect(results.length).toEqual(1);
        expect(results[0]['_perishable_token']).toEqual(undefined);
        done();
      },
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailing app',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setPassword('asdf');
    user.setUsername('zxcv');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await Parse.User.requestPasswordReset('user@parse.com');
  });

  it('should return ajax failure error on ajax request with wrong data provided', async () => {
    await reconfigureServer({
      publicServerURL: 'http://localhost:8378/1',
    });

    try {
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/apps/test/request_password_reset',
        body: `new_password=user1&token=12345&username=Johnny`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        followRedirects: false,
      });
    } catch (error) {
      expect(error.status).not.toBe(302);
      expect(error.text).toEqual(
        '{"code":-1,"error":"Failed to reset password: username / email / token is invalid"}'
      );
    }
  });

  it('deletes password reset token on email address change', done => {
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
        const config = Config.get('test');
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('zxcv');
        user.set('email', 'test@parse.com');
        return user
          .signUp(null)
          .then(() => Parse.User.requestPasswordReset('test@parse.com'))
          .then(() =>
            config.database.adapter.find(
              '_User',
              { fields: {} },
              { username: 'zxcv' },
              { limit: 1 }
            )
          )
          .then(results => {
            // validate that there is a token
            expect(results.length).toEqual(1);
            expect(results[0]['_perishable_token']).not.toBeNull();
            user.set('email', 'test2@parse.com');
            return user.save();
          })
          .then(() =>
            config.database.adapter.find(
              '_User',
              { fields: {} },
              { username: 'zxcv' },
              { limit: 1 }
            )
          )
          .then(results => {
            expect(results.length).toEqual(1);
            expect(results[0]['_perishable_token']).toBeUndefined();
            done();
          });
      })
      .catch(error => {
        fail(JSON.stringify(error));
        done();
      });
  });

  describe('localization of custom pages', () => {
    let router = new PublicAPIRouter();
    let req;
    let pageResponse;
    let redirectResponse;
    const config = {
      appId: 'test',
      appName: 'ExampleAppName',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {},
      },
      publicServerURL: 'http://localhost:8378/1',
      enablePageLocalization: true,
    };

    beforeEach(async () => {
      router = new PublicAPIRouter();
      pageResponse = spyOn(router, 'pageResponse').and.callThrough();
      redirectResponse = spyOn(router, 'redirectResponse').and.callThrough();
      req = {
        method: 'GET',
        config: {
          customPages: {},
          enablePageLocalization: true,
          publicServerURL: 'http://example.com',
        },
        query: {
          locale: 'de-AT',
        },
      };
    });

    it('returns default file if localization is disabled', async () => {
      delete req.config.enablePageLocalization;

      await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
      expect(pageResponse.calls.all()[0].args[1]).toBeDefined();
      expect(pageResponse.calls.all()[0].args[1]).not.toMatch(
        new RegExp(`\/de(-AT)?\/${pages.invalidLink.defaultFile}`)
      );
    });

    it('returns default file if no locale is specified', async () => {
      delete req.query.locale;

      await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
      expect(pageResponse.calls.all()[0].args[1]).toBeDefined();
      expect(pageResponse.calls.all()[0].args[1]).not.toMatch(
        new RegExp(`\/de(-AT)?\/${pages.invalidLink.defaultFile}`)
      );
    });

    it('returns custom page regardless of localization enabled', async () => {
      req.config.customPages = { invalidLink: 'http://invalid-link.example.com' };

      await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
      expect(pageResponse).not.toHaveBeenCalled();
      expect(redirectResponse.calls.all()[0].args[0]).toBe(req.config.customPages.invalidLink);
    });

    it('returns file for locale match', async () => {
      await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
      expect(pageResponse.calls.all()[0].args[1]).toBeDefined();
      expect(pageResponse.calls.all()[0].args[1]).toMatch(
        new RegExp(`\/de-AT\/${pages.invalidLink.defaultFile}`)
      );
    });

    it('returns file for language match', async () => {
      // Pretend no locale matching file exists
      spyOn(Utils, 'fileExists').and.callFake(async path => {
        return !path.includes(`/de-AT/${pages.invalidLink.defaultFile}`);
      });

      await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
      expect(pageResponse.calls.all()[0].args[1]).toBeDefined();
      expect(pageResponse.calls.all()[0].args[1]).toMatch(
        new RegExp(`\/de\/${pages.invalidLink.defaultFile}`)
      );
    });

    it('returns default file for neither locale nor language match', async () => {
      req.query.locale = 'yo-LO';

      await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
      expect(pageResponse.calls.all()[0].args[1]).toBeDefined();
      expect(pageResponse.calls.all()[0].args[1]).not.toMatch(
        new RegExp(`\/yo(-LO)?\/${pages.invalidLink.defaultFile}`)
      );
    });

    it('returns a file for GET request', async () => {
      await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
      expect(pageResponse).toHaveBeenCalled();
      expect(redirectResponse).not.toHaveBeenCalled();
    });

    it('returns a redirect for POST request', async () => {
      req.method = 'POST';
      await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
      expect(pageResponse).not.toHaveBeenCalled();
      expect(redirectResponse).toHaveBeenCalled();
    });

    it('returns a redirect for custom pages for GET and POST', async () => {
      req.config.customPages = { invalidLink: 'http://invalid-link.example.com' };

      for (const method of ['GET', 'POST']) {
        req.method = method;
        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse).not.toHaveBeenCalled();
        expect(redirectResponse).toHaveBeenCalled();
      }
    });

    it('responds to POST request with redirect response (e2e test)', async () => {
      await reconfigureServer(config);
      const response = await request({
        url:
          'http://localhost:8378/1/apps/test/request_password_reset?token=exampleToken&username=exampleUsername&locale=de-AT',
        followRedirects: false,
        method: 'POST',
      });
      expect(response.status).toEqual(303);
      expect(response.headers.location).toEqual(
        'http://localhost:8378/apps/de-AT/invalid_link.html'
      );
    });

    it('responds to GET request with content response (e2e test)', async () => {
      await reconfigureServer(config);
      const response = await request({
        url:
          'http://localhost:8378/1/apps/test/request_password_reset?token=exampleToken&username=exampleUsername&locale=de-AT',
        followRedirects: false,
        method: 'GET',
      });
      expect(response.status).toEqual(200);
      expect(response.text).toContain('<html>');
    });
  });
});
