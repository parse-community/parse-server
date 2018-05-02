"use strict";

const request = require('request');

const verifyUsernameAndPassword = function(username = '', password = '') {
  return new Promise((resolve, reject) => {
    request.post({
      url: Parse.serverURL + '/verifyPassword',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest'
      },
      json: {
        _method: 'POST',
        username,
        password,
      }
    }, (error, response, body) => {
      if (error) reject(error);
      resolve({response, body});
    });
  });
};

const verifyEmailAndPassword = function(email = '', password = '') {
  return new Promise((resolve, reject) => {
    request.post({
      url: Parse.serverURL + '/verifyPassword',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest'
      },
      json: {
        _method: 'POST',
        email,
        password,
      }
    }, (error, response, body) => {
      if (error) reject(error);
      resolve({response, body});
    });
  });
};

const isAccountLockoutError = function(username, password, duration, waitTime) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      Parse.User.logIn(username, password)
        .then(() => reject('login should have failed'))
        .catch(err => {
          if (err.message === 'Your account is locked due to multiple failed login attempts. Please try again after ' + duration + ' minute(s)') {
            resolve();
          } else {
            reject(err);
          }
        });
    }, waitTime);
  });
};

describe("Verify User Password", () => {
  it('fails to verify password when email is not provided with REST API', (done) => {
    const user = new Parse.User();
    user.save({
      username: 'testuser',
      password: 'mypass',
      email: 'my@user.com'
    }).then(() => {
      return verifyEmailAndPassword('', 'mypass');
    }).then((results) => {
      const { response, body } = results;
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(body)).toMatch('{"code":200,"error":"username/email is required."}');
      done();
    });
  });
  it('fails to verify password when password is not provided with REST API', (done) => {
    const user = new Parse.User();
    user.save({
      username: 'testuser',
      password: 'mypass',
      email: 'my@user.com'
    }).then(() => {
      return verifyUsernameAndPassword('testuser', '');
    }).then((results) => {
      const { response, body } = results;
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(body)).toMatch('{"code":201,"error":"password is required."}');
      done();
    });
  });
  it('fails to verify password when username is not provided with REST API', (done) => {
    const user = new Parse.User();
    user.save({
      username: 'testuser',
      password: 'mypass',
      email: 'my@user.com'
    }).then(() => {
      return verifyUsernameAndPassword('', 'mypass');
    }).then((results) => {
      const { response, body } = results;
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(body)).toMatch('{"code":200,"error":"username/email is required."}');
      done();
    });
  });
  it('fails to verify password when password does not match hash with REST API', (done) => {
    const user = new Parse.User();
    user.save({
      username: 'testuser',
      password: 'mypass',
      email: 'my@user.com'
    }).then(() => {
      return verifyUsernameAndPassword('testuser', 'mywrongpass');
    }).then((results) => {
      const { response, body } = results;
      expect(response.statusCode).toBe(404);
      expect(JSON.stringify(body)).toMatch('{"code":101,"error":"Invalid username/password."}');
      done();
    });
  });
  it('verify password lock account if failed verify password attempts are above threshold', done => {
    reconfigureServer({
      appName: 'lockout threshold',
      accountLockout: {
        duration: 1,
        threshold: 2
      },
      publicServerURL: "http://localhost:8378/"
    })
      .then(() => {
        const user = new Parse.User();
        return user.save({
          username: 'testuser',
          password: 'mypass',
          email: 'my@user.com'
        })
      })
      .then(() => {
        return verifyUsernameAndPassword('testuser', 'wrong password');
      })
      .then(() => {
        return verifyUsernameAndPassword('testuser', 'wrong password');
      })
      .then(() => {
        return isAccountLockoutError('testuser', 'wrong password', 1, 1);
      })
      .then(() => {
        done();
      })
      .catch(err => {
        fail('lock account after failed login attempts test failed: ' + JSON.stringify(err));
        done();
      });
  });
  it('succeed in verifying password with username and password matches hash with REST API', (done) => {
    const user = new Parse.User();
    user.save({
      username: 'testuser',
      password: 'mypass',
      email: 'my@user.com'
    }).then(() => {
      return verifyUsernameAndPassword('testuser', 'mypass');
    }).then((results) => {
      const { response, body } = results;
      expect(response.statusCode).toBe(200);
      expect(typeof body['objectId']).toEqual('string');
      expect(body.hasOwnProperty('sessionToken')).toEqual(false);
      expect(body.hasOwnProperty('password')).toEqual(false);
      done();
    });
  });
  it('succeed in verifying password with email and password matches hash with REST API', (done) => {
    const user = new Parse.User();
    user.save({
      username: 'testuser',
      password: 'mypass',
      email: 'my@user.com'
    }).then(() => {
      return verifyEmailAndPassword('my@user.com', 'mypass');
    }).then((results) => {
      const { response, body } = results;
      expect(response.statusCode).toBe(200);
      expect(typeof body['objectId']).toEqual('string');
      expect(body.hasOwnProperty('sessionToken')).toEqual(false);
      expect(body.hasOwnProperty('password')).toEqual(false);
      done();
    });
  });
})
