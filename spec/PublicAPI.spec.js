const req = require('../lib/request');
const Config = require('../lib/Config');

const request = function (url, callback) {
  return req({
    url,
  }).then(
    response => callback(null, response),
    err => callback(err, err)
  );
};

describe('public API', () => {
  it('should return missing username error on ajax request without username provided', async () => {
    await reconfigureServer({
      publicServerURL: 'http://localhost:8378/1',
    });

    try {
      await req({
        method: 'POST',
        url: 'http://localhost:8378/1/apps/test/request_password_reset',
        body: `new_password=user1&token=43634643&username=`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        followRedirects: false,
      });
    } catch (error) {
      expect(error.status).not.toBe(302);
      expect(error.text).toEqual('{"code":200,"error":"Missing username"}');
    }
  });

  it('should return missing token error on ajax request without token provided', async () => {
    await reconfigureServer({
      publicServerURL: 'http://localhost:8378/1',
    });

    try {
      await req({
        method: 'POST',
        url: 'http://localhost:8378/1/apps/test/request_password_reset',
        body: `new_password=user1&token=&username=Johnny`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        followRedirects: false,
      });
    } catch (error) {
      expect(error.status).not.toBe(302);
      expect(error.text).toEqual('{"code":-1,"error":"Missing token"}');
    }
  });

  it('should return missing password error on ajax request without password provided', async () => {
    await reconfigureServer({
      publicServerURL: 'http://localhost:8378/1',
    });

    try {
      await req({
        method: 'POST',
        url: 'http://localhost:8378/1/apps/test/request_password_reset',
        body: `new_password=&token=132414&username=Johnny`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        followRedirects: false,
      });
    } catch (error) {
      expect(error.status).not.toBe(302);
      expect(error.text).toEqual('{"code":201,"error":"Missing password"}');
    }
  });

  it('should get invalid_link.html', done => {
    request(
      'http://localhost:8378/1/apps/invalid_link.html',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(200);
        done();
      }
    );
  });

  it('should get choose_password', done => {
    reconfigureServer({
      appName: 'unused',
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      request(
        'http://localhost:8378/1/apps/choose_password?id=test',
        (err, httpResponse) => {
          expect(httpResponse.status).toBe(200);
          done();
        }
      );
    });
  });

  it('should get verify_email_success.html', done => {
    request(
      'http://localhost:8378/1/apps/verify_email_success.html',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(200);
        done();
      }
    );
  });

  it('should get password_reset_success.html', done => {
    request(
      'http://localhost:8378/1/apps/password_reset_success.html',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(200);
        done();
      }
    );
  });
});

describe('public API without publicServerURL', () => {
  beforeEach(done => {
    reconfigureServer({ appName: 'unused' }).then(done, fail);
  });
  it('should get 404 on verify_email', done => {
    request(
      'http://localhost:8378/1/apps/test/verify_email',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(404);
        done();
      }
    );
  });

  it('should get 404 choose_password', done => {
    request(
      'http://localhost:8378/1/apps/choose_password?id=test',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(404);
        done();
      }
    );
  });

  it('should get 404 on request_password_reset', done => {
    request(
      'http://localhost:8378/1/apps/test/request_password_reset',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(404);
        done();
      }
    );
  });
});

describe('public API supplied with invalid application id', () => {
  beforeEach(done => {
    reconfigureServer({ appName: 'unused' }).then(done, fail);
  });

  it('should get 403 on verify_email', done => {
    request(
      'http://localhost:8378/1/apps/invalid/verify_email',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(403);
        done();
      }
    );
  });

  it('should get 403 choose_password', done => {
    request(
      'http://localhost:8378/1/apps/choose_password?id=invalid',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(403);
        done();
      }
    );
  });

  it('should get 403 on get of request_password_reset', done => {
    request(
      'http://localhost:8378/1/apps/invalid/request_password_reset',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(403);
        done();
      }
    );
  });

  it('should get 403 on post of request_password_reset', done => {
    req({
      url: 'http://localhost:8378/1/apps/invalid/request_password_reset',
      method: 'POST',
    }).then(done.fail, httpResponse => {
      expect(httpResponse.status).toBe(403);
      done();
    });
  });

  it('should get 403 on resendVerificationEmail', done => {
    request(
      'http://localhost:8378/1/apps/invalid/resend_verification_email',
      (err, httpResponse) => {
        expect(httpResponse.status).toBe(403);
        done();
      }
    );
  });

  describe('resetPassword', () => {
    let makeRequest;
    const re = new RegExp('^(?=.*[a-z]).{8,}');
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: {},
      sendPasswordResetEmail: options => {
        sendEmailOptions = options;
      },
      sendMail: () => {},
    };

    const serverURL = 'http://localhost:8378/1';

    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
      'X-Parse-Installation-Id': 'yolo',
    };

    beforeEach(() => {
      makeRequest = reconfigureServer({
        appName: 'coolapp',
        publicServerURL: 'http://localhost:1337/1',
        emailAdapter: emailAdapter,
        passwordPolicy: {
          validatorPattern: re,
          doNotAllowUsername: true,
          maxPasswordHistory: 1,
          resetTokenValidityDuration: 0.5, // 0.5 second
        },
      }).then(() => {
        const config = Config.get('test');
        const user = new Parse.User();
        user.setPassword('asdsweqwasas');
        user.setUsername('test');
        user.set('email', 'test@parse.com');
        return user
          .signUp(null)
          .then(() => {
            // build history
            user.setPassword('aaaaaaaaaaaa');
            return user.save();
          })
          .then(() => Parse.User.requestPasswordReset('test@parse.com'))
          .then(() =>
            config.database.adapter.find(
              '_User',
              { fields: {} },
              { username: 'test' },
              { limit: 1 }
            )
          );
      });
    });

    it('Password reset failed due to password policy', done => {
      makeRequest.then(results => {
        req({
          url: `${serverURL}/passwordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            _method: 'POST',
            username: 'test',
            token: results[0]['_perishable_token'],
            new_password: 'zxcv',
          }),
        }).then(
          () => {
            fail('Expected to be failed');
            done();
          },
          err => {
            // TODO: Parse.Error.VALIDATION_ERROR is generic, there should be another error code like Parse.Error.PASSWORD_POLICY_NOT_MEET
            expect(err.data.code).not.toBe(undefined);
            expect(err.data.code).toBe(Parse.Error.VALIDATION_ERROR);
            done();
          }
        );
      });
    });

    it('Password reset failed due to invalid token', done => {
      makeRequest.then(results => {
        req({
          url: `${serverURL}/passwordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            _method: 'POST',
            username: 'test',
            token: results[0]['_perishable_token'] + 'invalid',
            new_password: 'zxcv',
          }),
        }).then(
          () => {
            fail('Expected to be failed');
            done();
          },
          err => {
            // TODO: Missing Parse.Error code, only string message, there should be an error code like Parse.Error.RESET_PASSWORD_ERROR
            expect(err.data.code).not.toBe(undefined);
            done();
          }
        );
      });
    });

    it('Password reset failed due to password is repeated', done => {
      makeRequest.then(results => {
        req({
          url: `${serverURL}/passwordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            _method: 'POST',
            username: 'test',
            token: results[0]['_perishable_token'],
            new_password: 'aaaaaaaaaaaa',
          }),
        }).then(
          () => {
            fail('Expected to be failed');
            done();
          },
          err => {
            // TODO: Parse.Error.VALIDATION_ERROR is generic, there should be another error code like Parse.Error.PASSWORD_POLICY_REPEAT
            expect(err.data.code).not.toBe(undefined);
            expect(err.data.code).toBe(Parse.Error.VALIDATION_ERROR);
            done();
          }
        );
      });
    });

    it('Password reset failed due to it contains username', done => {
      makeRequest.then(results => {
        req({
          url: `${serverURL}/passwordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            _method: 'POST',
            username: 'test',
            token: results[0]['_perishable_token'],
            new_password: 'asdsweqwasastest',
          }),
        }).then(
          () => {
            fail('Expected to be failed');
            done();
          },
          err => {
            // TODO: Parse.Error.VALIDATION_ERROR is generic, there should be another error code like Parse.Error.PASSWORD_POLICY_USERNAME
            expect(err.data.code).not.toBe(undefined);
            expect(err.data.code).toBe(Parse.Error.VALIDATION_ERROR);
            done();
          }
        );
      });
    });

    it('Password reset username not found', done => {
      makeRequest.then(results => {
        req({
          url: `${serverURL}/passwordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            _method: 'POST',
            username: 'test1',
            token: results[0]['_perishable_token'],
            new_password: 'asdsweqwasastest',
          }),
        }).then(
          () => {
            fail('Expected to be failed');
            done();
          },
          err => {
            // TODO: Missing Parse.Error code, only string message, there should be an error code like Parse.Error.USERNAME_NOT_FOUND
            expect(err.data.code).not.toBe(undefined);
            done();
          }
        );
      });
    });

    it('Password reset failed due to link has expired', done => {
      makeRequest
        .then(results => {
          // wait for a bit more than the validity duration set
          setTimeout(() => {
            expect(sendEmailOptions).not.toBeUndefined();

            req({
              url: `${serverURL}/passwordReset`,
              method: 'POST',
              headers,
              body: JSON.stringify({
                _method: 'POST',
                username: 'test',
                token: results[0]['_perishable_token'],
                new_password: 'asdsweqwasas',
              }),
            })
              .then(() => {
                fail('Expected to be failed');
                done();
              })
              .catch(error => {
                // TODO: Missing Parse.Error code, only string message, there should be an error code like Parse.Error.RESET_LINK_EXPIRED
                expect(error.data.code).not.toBe(undefined);
                expect(error.data.code).toBe(Parse.Error.RESET_LINK_EXPIRED);
              });
            done();
          }, 1000);
        })
        .catch(err => {
          jfail(err);
          done();
        });
    });

    it('Password successfully reset', done => {
      makeRequest.then(results => {
        req({
          url: `${serverURL}/passwordReset`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            _method: 'POST',
            username: 'test',
            token: results[0]['_perishable_token'],
            new_password: 'asdsweqwasas',
          }),
        }).then(
          res => {
            expect(res.status).toBe(200);
            done();
          },
          () => {
            fail('Expected to not fail');
            done();
          }
        );
      });
    });
  });
});
