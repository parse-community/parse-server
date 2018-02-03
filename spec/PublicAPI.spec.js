
var request = require('request');

describe("public API", () => {
  it("should get invalid_link.html", (done) => {
    request('http://localhost:8378/1/apps/invalid_link.html', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(200);
      done();
    });
  });

  it("should get choose_password", (done) => {
    reconfigureServer({
      appName: 'unused',
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        request('http://localhost:8378/1/apps/choose_password?id=test', (err, httpResponse) => {
          expect(httpResponse.statusCode).toBe(200);
          done();
        });
      })
  });

  it("should get verify_email_success.html", (done) => {
    request('http://localhost:8378/1/apps/verify_email_success.html', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(200);
      done();
    });
  });

  it("should get password_reset_success.html", (done) => {
    request('http://localhost:8378/1/apps/password_reset_success.html', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(200);
      done();
    });
  });
});

describe("public API without publicServerURL", () => {
  beforeEach(done => {
    reconfigureServer({ appName: 'unused' })
      .then(done, fail);
  });
  it("should get 404 on verify_email", (done) => {
    request('http://localhost:8378/1/apps/test/verify_email', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(404);
      done();
    });
  });

  it("should get 404 choose_password", (done) => {
    request('http://localhost:8378/1/apps/choose_password?id=test', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(404);
      done();
    });
  });

  it("should get 404 on request_password_reset", (done) => {
    request('http://localhost:8378/1/apps/test/request_password_reset', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(404);
      done();
    });
  });
});


describe("public API supplied with invalid application id", () => {
  beforeEach(done => {
    reconfigureServer({appName: "unused"})
      .then(done, fail);
  });

  it("should get 403 on verify_email", (done) => {
    request('http://localhost:8378/1/apps/invalid/verify_email', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(403);
      done();
    });
  });

  it("should get 403 choose_password", (done) => {
    request('http://localhost:8378/1/apps/choose_password?id=invalid', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(403);
      done();
    });
  });

  it("should get 403 on get of request_password_reset", (done) => {
    request('http://localhost:8378/1/apps/invalid/request_password_reset', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(403);
      done();
    });
  });


  it("should get 403 on post of request_password_reset", (done) => {
    request.post('http://localhost:8378/1/apps/invalid/request_password_reset', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(403);
      done();
    });
  });

  it("should get 403 on resendVerificationEmail", (done) => {
    request('http://localhost:8378/1/apps/invalid/resend_verification_email', (err, httpResponse) => {
      expect(httpResponse.statusCode).toBe(403);
      done();
    });
  });
});
