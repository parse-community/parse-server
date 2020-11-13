'use strict';

const request = require('../lib/request');
const MockEmailAdapterWithOptions = require('./MockEmailAdapterWithOptions');

const verifyPassword = function (login, password, isEmail = false) {
  const body = !isEmail ? { username: login, password } : { email: login, password };
  return request({
    url: Parse.serverURL + '/verifyPassword',
    headers: {
      'X-Parse-Application-Id': Parse.applicationId,
      'X-Parse-REST-API-Key': 'rest',
    },
    qs: body,
  })
    .then(res => res)
    .catch(err => err);
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

describe('Verify User Password', () => {
  it('fails to verify password when masterKey has locked out user', done => {
    const user = new Parse.User();
    const ACL = new Parse.ACL();
    ACL.setPublicReadAccess(false);
    ACL.setPublicWriteAccess(false);
    user.setUsername('testuser');
    user.setPassword('mypass');
    user.setACL(ACL);
    user
      .signUp()
      .then(() => {
        return Parse.User.logIn('testuser', 'mypass');
      })
      .then(user => {
        equal(user.get('username'), 'testuser');
        // Lock the user down
        const ACL = new Parse.ACL();
        user.setACL(ACL);
        return user.save(null, { useMasterKey: true });
      })
      .then(() => {
        expect(user.getACL().getPublicReadAccess()).toBe(false);
        return request({
          url: Parse.serverURL + '/verifyPassword',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: {
            username: 'testuser',
            password: 'mypass',
          },
        });
      })
      .then(res => {
        fail(res);
        done();
      })
      .catch(err => {
        expect(err.status).toBe(404);
        expect(err.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      });
  });
  it('fails to verify password when username is not provided in query string REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return request({
          url: Parse.serverURL + '/verifyPassword',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: {
            username: '',
            password: 'mypass',
          },
        });
      })
      .then(res => {
        fail(res);
        done();
      })
      .catch(err => {
        expect(err.status).toBe(400);
        expect(err.text).toMatch('{"code":200,"error":"username/email is required."}');
        done();
      });
  });
  it('fails to verify password when email is not provided in query string REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return request({
          url: Parse.serverURL + '/verifyPassword',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: {
            email: '',
            password: 'mypass',
          },
        });
      })
      .then(res => {
        fail(res);
        done();
      })
      .catch(err => {
        expect(err.status).toBe(400);
        expect(err.text).toMatch('{"code":200,"error":"username/email is required."}');
        done();
      });
  });
  it('fails to verify password when username is not provided with json payload REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword('', 'mypass');
      })
      .then(res => {
        expect(res.status).toBe(400);
        expect(res.text).toMatch('{"code":200,"error":"username/email is required."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when email is not provided with json payload REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword('', 'mypass', true);
      })
      .then(res => {
        expect(res.status).toBe(400);
        expect(res.text).toMatch('{"code":200,"error":"username/email is required."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when password is not provided with json payload REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword('testuser', '');
      })
      .then(res => {
        expect(res.status).toBe(400);
        expect(res.text).toMatch('{"code":201,"error":"password is required."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when username matches but password does not match hash with json payload REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword('testuser', 'wrong password');
      })
      .then(res => {
        expect(res.status).toBe(404);
        expect(res.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when email matches but password does not match hash with json payload REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword('my@user.com', 'wrong password', true);
      })
      .then(res => {
        expect(res.status).toBe(404);
        expect(res.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when typeof username does not equal string REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword(123, 'mypass');
      })
      .then(res => {
        expect(res.status).toBe(404);
        expect(res.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when typeof email does not equal string REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword(123, 'mypass', true);
      })
      .then(res => {
        expect(res.status).toBe(404);
        expect(res.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when typeof password does not equal string REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword('my@user.com', 123, true);
      })
      .then(res => {
        expect(res.status).toBe(404);
        expect(res.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when username cannot be found REST API', done => {
    verifyPassword('mytestuser', 'mypass')
      .then(res => {
        expect(res.status).toBe(404);
        expect(res.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when email cannot be found REST API', done => {
    verifyPassword('my@user.com', 'mypass', true)
      .then(res => {
        expect(res.status).toBe(404);
        expect(res.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('fails to verify password when preventLoginWithUnverifiedEmail is set to true REST API', done => {
    reconfigureServer({
      publicServerURL: 'http://localhost:8378/',
      appName: 'emailVerify',
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
        return user.save({
          username: 'unverified-user',
          password: 'mypass',
          email: 'unverified-email@user.com',
        });
      })
      .then(() => {
        return verifyPassword('unverified-email@user.com', 'mypass', true);
      })
      .then(res => {
        expect(res.status).toBe(400);
        expect(res.text).toMatch('{"code":205,"error":"User email is not verified."}');
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('verify password lock account if failed verify password attempts are above threshold', done => {
    reconfigureServer({
      appName: 'lockout threshold',
      accountLockout: {
        duration: 1,
        threshold: 2,
      },
      publicServerURL: 'http://localhost:8378/',
    })
      .then(() => {
        const user = new Parse.User();
        return user.save({
          username: 'testuser',
          password: 'mypass',
          email: 'my@user.com',
        });
      })
      .then(() => {
        return verifyPassword('testuser', 'wrong password');
      })
      .then(() => {
        return verifyPassword('testuser', 'wrong password');
      })
      .then(() => {
        return verifyPassword('testuser', 'wrong password');
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
  it('succeed in verifying password when username and email are provided and password matches hash with json payload REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return request({
          url: Parse.serverURL + '/verifyPassword',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: {
            username: 'testuser',
            email: 'my@user.com',
            password: 'mypass',
          },
          json: true,
        })
          .then(res => res)
          .catch(err => err);
      })
      .then(response => {
        const res = response.data;
        expect(typeof res).toBe('object');
        expect(typeof res['objectId']).toEqual('string');
        expect(Object.prototype.hasOwnProperty.call(res, 'sessionToken')).toEqual(false);
        expect(Object.prototype.hasOwnProperty.call(res, 'password')).toEqual(false);
        done();
      })
      .catch(err => {
        fail(err);
        done();
      });
  });
  it('succeed in verifying password when username and password matches hash with json payload REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword('testuser', 'mypass');
      })
      .then(response => {
        const res = response.data;
        expect(typeof res).toBe('object');
        expect(typeof res['objectId']).toEqual('string');
        expect(Object.prototype.hasOwnProperty.call(res, 'sessionToken')).toEqual(false);
        expect(Object.prototype.hasOwnProperty.call(res, 'password')).toEqual(false);
        done();
      });
  });
  it('succeed in verifying password when email and password matches hash with json payload REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return verifyPassword('my@user.com', 'mypass', true);
      })
      .then(response => {
        const res = response.data;
        expect(typeof res).toBe('object');
        expect(typeof res['objectId']).toEqual('string');
        expect(Object.prototype.hasOwnProperty.call(res, 'sessionToken')).toEqual(false);
        expect(Object.prototype.hasOwnProperty.call(res, 'password')).toEqual(false);
        done();
      });
  });
  it('succeed to verify password when username and password provided in query string REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return request({
          url: Parse.serverURL + '/verifyPassword',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: {
            username: 'testuser',
            password: 'mypass',
          },
        });
      })
      .then(response => {
        const res = response.text;
        expect(typeof res).toBe('string');
        const body = JSON.parse(res);
        expect(typeof body['objectId']).toEqual('string');
        expect(Object.prototype.hasOwnProperty.call(body, 'sessionToken')).toEqual(false);
        expect(Object.prototype.hasOwnProperty.call(body, 'password')).toEqual(false);
        done();
      });
  });
  it('succeed to verify password when email and password provided in query string REST API', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'testuser',
        password: 'mypass',
        email: 'my@user.com',
      })
      .then(() => {
        return request({
          url: Parse.serverURL + '/verifyPassword',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: {
            email: 'my@user.com',
            password: 'mypass',
          },
        });
      })
      .then(response => {
        const res = response.text;
        expect(typeof res).toBe('string');
        const body = JSON.parse(res);
        expect(typeof body['objectId']).toEqual('string');
        expect(Object.prototype.hasOwnProperty.call(body, 'sessionToken')).toEqual(false);
        expect(Object.prototype.hasOwnProperty.call(body, 'password')).toEqual(false);
        done();
      });
  });
  it('succeed to verify password with username when user1 has username === user2 email REST API', done => {
    const user1 = new Parse.User();
    user1
      .save({
        username: 'email@user.com',
        password: 'mypass1',
        email: '1@user.com',
      })
      .then(() => {
        const user2 = new Parse.User();
        return user2.save({
          username: 'user2',
          password: 'mypass2',
          email: 'email@user.com',
        });
      })
      .then(() => {
        return verifyPassword('email@user.com', 'mypass1');
      })
      .then(response => {
        const res = response.data;
        expect(typeof res).toBe('object');
        expect(typeof res['objectId']).toEqual('string');
        expect(Object.prototype.hasOwnProperty.call(res, 'sessionToken')).toEqual(false);
        expect(Object.prototype.hasOwnProperty.call(res, 'password')).toEqual(false);
        done();
      });
  });
});
