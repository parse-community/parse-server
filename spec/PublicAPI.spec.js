
var request = require('request');

describe("public API", () => {
  beforeEach(done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      publicServerURL: 'http://localhost:8378/1'
    });
    done();
  })
  it("should get invalid_link.html", (done) => {
    request('http://localhost:8378/1/apps/invalid_link.html', (err, httpResponse, body) => {
      expect(httpResponse.statusCode).toBe(200);
      done();
    });
  });
  
  it("should get choose_password", (done) => {
    request('http://localhost:8378/1/apps/choose_password?id=test', (err, httpResponse, body) => {
      expect(httpResponse.statusCode).toBe(200);
      done();
    });
  });
  
  it("should get verify_email_success.html", (done) => {
    request('http://localhost:8378/1/apps/verify_email_success.html', (err, httpResponse, body) => {
      expect(httpResponse.statusCode).toBe(200);
      done();
    });
  });
  
  it("should get password_reset_success.html", (done) => {
    request('http://localhost:8378/1/apps/password_reset_success.html', (err, httpResponse, body) => {
      expect(httpResponse.statusCode).toBe(200);
      done();
    });
  });
});

describe("public API without publicServerURL", () => {
    beforeEach(done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
    });
    done();
  })
  it("should get 404 on verify_email", (done) => {
    request('http://localhost:8378/1/apps/test/verify_email', (err, httpResponse, body) => {
      expect(httpResponse.statusCode).toBe(404);
      done();
    });
  });
  
  it("should get 404 choose_password", (done) => {
    request('http://localhost:8378/1/apps/choose_password?id=test', (err, httpResponse, body) => {
      expect(httpResponse.statusCode).toBe(404);
      done();
    });
  });
  
  it("should get 404 on request_password_reset", (done) => {
    request('http://localhost:8378/1/apps/test/request_password_reset', (err, httpResponse, body) => {
      expect(httpResponse.statusCode).toBe(404);
      done();
    });
  });
});
