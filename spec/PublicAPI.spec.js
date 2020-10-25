const req = require('../lib/request');

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
    request('http://localhost:8378/1/apps/invalid_link.html', (err, httpResponse) => {
      expect(httpResponse.status).toBe(200);
      done();
    });
  });

  it('should get choose_password', done => {
    reconfigureServer({
      appName: 'unused',
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      request('http://localhost:8378/1/apps/choose_password?id=test', (err, httpResponse) => {
        expect(httpResponse.status).toBe(200);
        done();
      });
    });
  });

  it('should get verify_email_success.html', done => {
    request('http://localhost:8378/1/apps/verify_email_success.html', (err, httpResponse) => {
      expect(httpResponse.status).toBe(200);
      done();
    });
  });

  it('should get password_reset_success.html', done => {
    request('http://localhost:8378/1/apps/password_reset_success.html', (err, httpResponse) => {
      expect(httpResponse.status).toBe(200);
      done();
    });
  });
});

describe('public API without publicServerURL', () => {
  beforeEach(done => {
    reconfigureServer({ appName: 'unused' }).then(done, fail);
  });
  it('should get 404 on verify_email', done => {
    request('http://localhost:8378/1/apps/test/verify_email', (err, httpResponse) => {
      expect(httpResponse.status).toBe(404);
      done();
    });
  });

  it('should get 404 choose_password', done => {
    request('http://localhost:8378/1/apps/choose_password?id=test', (err, httpResponse) => {
      expect(httpResponse.status).toBe(404);
      done();
    });
  });

  it('should get 404 on request_password_reset', done => {
    request('http://localhost:8378/1/apps/test/request_password_reset', (err, httpResponse) => {
      expect(httpResponse.status).toBe(404);
      done();
    });
  });
});

describe('public API supplied with invalid application id', () => {
  beforeEach(done => {
    reconfigureServer({ appName: 'unused' }).then(done, fail);
  });

  it('should get 403 on verify_email', done => {
    request('http://localhost:8378/1/apps/invalid/verify_email', (err, httpResponse) => {
      expect(httpResponse.status).toBe(403);
      done();
    });
  });

  it('should get 403 choose_password', done => {
    request('http://localhost:8378/1/apps/choose_password?id=invalid', (err, httpResponse) => {
      expect(httpResponse.status).toBe(403);
      done();
    });
  });

  it('should get 403 on get of request_password_reset', done => {
    request('http://localhost:8378/1/apps/invalid/request_password_reset', (err, httpResponse) => {
      expect(httpResponse.status).toBe(403);
      done();
    });
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
});
