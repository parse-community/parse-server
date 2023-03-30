'use strict';

const Config = require('../lib/Config');
const Definitions = require('../lib/Options/Definitions');
const request = require('../lib/request');

const loginWithWrongCredentialsShouldFail = function (username, password) {
  return new Promise((resolve, reject) => {
    Parse.User.logIn(username, password)
      .then(() => reject('login should have failed'))
      .catch(err => {
        if (err.message === 'Invalid username/password.') {
          resolve();
        } else {
          reject(err);
        }
      });
  });
};

const isAccountLockoutError = function (username, password, duration, waitTime) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      Parse.User.logIn(username, password)
        .then(() => reject('login should have failed'))
        .catch(err => {
          if (
            err.message ===
            'Your account is locked due to multiple failed login attempts. Please try again after ' +
              duration +
              ' minute(s)'
          ) {
            resolve();
          } else {
            reject(err);
          }
        });
    }, waitTime);
  });
};

describe('Account Lockout Policy: ', () => {
  it('account should not be locked even after failed login attempts if account lockout policy is not set', done => {
    reconfigureServer({
      appName: 'unlimited',
      publicServerURL: 'http://localhost:1337/1',
    })
      .then(() => {
        const user = new Parse.User();
        user.setUsername('username1');
        user.setPassword('password');
        return user.signUp(null);
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username1', 'incorrect password 1');
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username1', 'incorrect password 2');
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username1', 'incorrect password 3');
      })
      .then(() => done())
      .catch(err => {
        fail('allow unlimited failed login attempts failed: ' + JSON.stringify(err));
        done();
      });
  });

  it('throw error if duration is set to an invalid number', done => {
    reconfigureServer({
      appName: 'duration',
      accountLockout: {
        duration: 'invalid value',
        threshold: 5,
      },
      publicServerURL: 'https://my.public.server.com/1',
    })
      .then(() => {
        Config.get('test');
        fail('set duration to an invalid number test failed');
        done();
      })
      .catch(err => {
        if (
          err &&
          err === 'Account lockout duration should be greater than 0 and less than 100000'
        ) {
          done();
        } else {
          fail('set duration to an invalid number test failed: ' + JSON.stringify(err));
          done();
        }
      });
  });

  it('throw error if threshold is set to an invalid number', done => {
    reconfigureServer({
      appName: 'threshold',
      accountLockout: {
        duration: 5,
        threshold: 'invalid number',
      },
      publicServerURL: 'https://my.public.server.com/1',
    })
      .then(() => {
        Config.get('test');
        fail('set threshold to an invalid number test failed');
        done();
      })
      .catch(err => {
        if (
          err &&
          err === 'Account lockout threshold should be an integer greater than 0 and less than 1000'
        ) {
          done();
        } else {
          fail('set threshold to an invalid number test failed: ' + JSON.stringify(err));
          done();
        }
      });
  });

  it('throw error if threshold is < 1', done => {
    reconfigureServer({
      appName: 'threshold',
      accountLockout: {
        duration: 5,
        threshold: 0,
      },
      publicServerURL: 'https://my.public.server.com/1',
    })
      .then(() => {
        Config.get('test');
        fail('threshold value < 1 is invalid test failed');
        done();
      })
      .catch(err => {
        if (
          err &&
          err === 'Account lockout threshold should be an integer greater than 0 and less than 1000'
        ) {
          done();
        } else {
          fail('threshold value < 1 is invalid test failed: ' + JSON.stringify(err));
          done();
        }
      });
  });

  it('throw error if threshold is > 999', done => {
    reconfigureServer({
      appName: 'threshold',
      accountLockout: {
        duration: 5,
        threshold: 1000,
      },
      publicServerURL: 'https://my.public.server.com/1',
    })
      .then(() => {
        Config.get('test');
        fail('threshold value > 999 is invalid test failed');
        done();
      })
      .catch(err => {
        if (
          err &&
          err === 'Account lockout threshold should be an integer greater than 0 and less than 1000'
        ) {
          done();
        } else {
          fail('threshold value > 999 is invalid test failed: ' + JSON.stringify(err));
          done();
        }
      });
  });

  it('throw error if duration is <= 0', done => {
    reconfigureServer({
      appName: 'duration',
      accountLockout: {
        duration: 0,
        threshold: 5,
      },
      publicServerURL: 'https://my.public.server.com/1',
    })
      .then(() => {
        Config.get('test');
        fail('duration value < 1 is invalid test failed');
        done();
      })
      .catch(err => {
        if (
          err &&
          err === 'Account lockout duration should be greater than 0 and less than 100000'
        ) {
          done();
        } else {
          fail('duration value < 1 is invalid test failed: ' + JSON.stringify(err));
          done();
        }
      });
  });

  it('throw error if duration is > 99999', done => {
    reconfigureServer({
      appName: 'duration',
      accountLockout: {
        duration: 100000,
        threshold: 5,
      },
      publicServerURL: 'https://my.public.server.com/1',
    })
      .then(() => {
        Config.get('test');
        fail('duration value > 99999 is invalid test failed');
        done();
      })
      .catch(err => {
        if (
          err &&
          err === 'Account lockout duration should be greater than 0 and less than 100000'
        ) {
          done();
        } else {
          fail('duration value > 99999 is invalid test failed: ' + JSON.stringify(err));
          done();
        }
      });
  });

  it('lock account if failed login attempts are above threshold', done => {
    reconfigureServer({
      appName: 'lockout threshold',
      accountLockout: {
        duration: 1,
        threshold: 2,
      },
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        const user = new Parse.User();
        user.setUsername('username2');
        user.setPassword('failedLoginAttemptsThreshold');
        return user.signUp();
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username2', 'wrong password');
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username2', 'wrong password');
      })
      .then(() => {
        return isAccountLockoutError('username2', 'wrong password', 1, 1);
      })
      .then(() => {
        done();
      })
      .catch(err => {
        fail('lock account after failed login attempts test failed: ' + JSON.stringify(err));
        done();
      });
  });

  it('lock account for accountPolicy.duration minutes if failed login attempts are above threshold', done => {
    reconfigureServer({
      appName: 'lockout threshold',
      accountLockout: {
        duration: 0.05, // 0.05*60 = 3 secs
        threshold: 2,
      },
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        const user = new Parse.User();
        user.setUsername('username3');
        user.setPassword('failedLoginAttemptsThreshold');
        return user.signUp();
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username3', 'wrong password');
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username3', 'wrong password');
      })
      .then(() => {
        return isAccountLockoutError('username3', 'wrong password', 0.05, 1);
      })
      .then(() => {
        // account should still be locked even after 2 seconds.
        return isAccountLockoutError('username3', 'wrong password', 0.05, 2000);
      })
      .then(() => {
        done();
      })
      .catch(err => {
        fail('account should be locked for duration mins test failed: ' + JSON.stringify(err));
        done();
      });
  });

  it('allow login for locked account after accountPolicy.duration minutes', done => {
    reconfigureServer({
      appName: 'lockout threshold',
      accountLockout: {
        duration: 0.05, // 0.05*60 = 3 secs
        threshold: 2,
      },
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        const user = new Parse.User();
        user.setUsername('username4');
        user.setPassword('correct password');
        return user.signUp();
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username4', 'wrong password');
      })
      .then(() => {
        return loginWithWrongCredentialsShouldFail('username4', 'wrong password');
      })
      .then(() => {
        // allow locked user to login after 3 seconds with a valid userid and password
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            Parse.User.logIn('username4', 'correct password')
              .then(() => resolve())
              .catch(err => reject(err));
          }, 3001);
        });
      })
      .then(() => {
        done();
      })
      .catch(err => {
        fail(
          'allow login for locked account after accountPolicy.duration minutes test failed: ' +
            JSON.stringify(err)
        );
        done();
      });
  });
});

describe('lockout with password reset option', () => {
  let sendPasswordResetEmail;

  async function setup(options = {}) {
    const accountLockout = Object.assign(
      {
        duration: 10000,
        threshold: 1,
      },
      options
    );
    const config = {
      appName: 'exampleApp',
      accountLockout: accountLockout,
      publicServerURL: 'http://localhost:8378/1',
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {},
      },
    };
    await reconfigureServer(config);

    sendPasswordResetEmail = spyOn(config.emailAdapter, 'sendPasswordResetEmail').and.callThrough();
  }

  it('accepts valid unlockOnPasswordReset option', async () => {
    const values = [true, false];

    for (const value of values) {
      await expectAsync(setup({ unlockOnPasswordReset: value })).toBeResolved();
    }
  });

  it('rejects invalid unlockOnPasswordReset option', async () => {
    const values = ['a', 0, {}, [], null];

    for (const value of values) {
      await expectAsync(setup({ unlockOnPasswordReset: value })).toBeRejected();
    }
  });

  it('uses default value if unlockOnPasswordReset is not set', async () => {
    await expectAsync(setup({ unlockOnPasswordReset: undefined })).toBeResolved();

    const parseConfig = Config.get(Parse.applicationId);
    expect(parseConfig.accountLockout.unlockOnPasswordReset).toBe(
      Definitions.AccountLockoutOptions.unlockOnPasswordReset.default
    );
  });

  it('allow login for locked account after password reset', async () => {
    await setup({ unlockOnPasswordReset: true });
    const config = Config.get(Parse.applicationId);

    const user = new Parse.User();
    const username = 'exampleUsername';
    const password = 'examplePassword';
    user.setUsername(username);
    user.setPassword(password);
    user.setEmail('mail@example.com');
    await user.signUp();

    await expectAsync(Parse.User.logIn(username, 'incorrectPassword')).toBeRejected();
    await expectAsync(Parse.User.logIn(username, password)).toBeRejected();

    await Parse.User.requestPasswordReset(user.getEmail());
    await expectAsync(Parse.User.logIn(username, password)).toBeRejected();

    const link = sendPasswordResetEmail.calls.all()[0].args[0].link;
    const linkUrl = new URL(link);
    const token = linkUrl.searchParams.get('token');
    const newPassword = 'newPassword';
    await request({
      method: 'POST',
      url: `${config.publicServerURL}/apps/test/request_password_reset`,
      body: `new_password=${newPassword}&token=${token}&username=${username}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      followRedirects: false,
    });

    await expectAsync(Parse.User.logIn(username, newPassword)).toBeResolved();
  });

  it('reject login for locked account after password reset (default)', async () => {
    await setup();
    const config = Config.get(Parse.applicationId);

    const user = new Parse.User();
    const username = 'exampleUsername';
    const password = 'examplePassword';
    user.setUsername(username);
    user.setPassword(password);
    user.setEmail('mail@example.com');
    await user.signUp();

    await expectAsync(Parse.User.logIn(username, 'incorrectPassword')).toBeRejected();
    await expectAsync(Parse.User.logIn(username, password)).toBeRejected();

    await Parse.User.requestPasswordReset(user.getEmail());
    await expectAsync(Parse.User.logIn(username, password)).toBeRejected();

    const link = sendPasswordResetEmail.calls.all()[0].args[0].link;
    const linkUrl = new URL(link);
    const token = linkUrl.searchParams.get('token');
    const newPassword = 'newPassword';
    await request({
      method: 'POST',
      url: `${config.publicServerURL}/apps/test/request_password_reset`,
      body: `new_password=${newPassword}&token=${token}&username=${username}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      followRedirects: false,
    });

    await expectAsync(Parse.User.logIn(username, newPassword)).toBeRejected();
  });
});
