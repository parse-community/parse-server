
var request = require('request');


describe("public API", () => {
  
  it("should get invalid_link.html", (done) => {
    request('http://localhost:8378/1/apps/invalid_link.html', (err, httpResponse, body) => {
      expect(httpResponse.statusCode).toBe(200);
      done();
    });
  });
  
  it("should get choose_password", (done) => {
    request('http://localhost:8378/1/apps/choose_password', (err, httpResponse, body) => {
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
  
  
})