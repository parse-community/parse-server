var request = require("request"),
  Parse = require('parse/node').Parse;

module.exports = function(options) {
  var promise = new Parse.Promise();
  var callbacks = {
    success: options.success,
    error: options.error
  };
  delete options.success;
  delete options.error;
  delete options.uri; // not supported
  if (typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
    options.headers = options.headers || {};
    options.headers['Content-Type'] = "application/json";
  }
  // set follow redirects to false by default
  options.followRedirect = options.followRedirects == true ? true : false;
  
  request(options, (error, response, body) => {
    var httpResponse = {};
    httpResponse.status = response.statusCode;
    httpResponse.headers = response.headers;
    httpResponse.buffer = new Buffer(response.body);
    httpResponse.cookies = response.headers["set-cookie"];
    httpResponse.text = response.body;
    try {
      httpResponse.data = JSON.parse(response.body);
    } catch (e) {}
    // Consider <200 && >= 400 as errors 
    if (error || httpResponse.status <200 || httpResponse.status >=400) {
      if (callbacks.error) {
        callbacks.error(httpResponse);
      }
      return promise.reject(httpResponse);
    } else {
      if (callbacks.success) {
        callbacks.success(httpResponse);
      }
      return promise.resolve(httpResponse);
    }
  });
  return promise;
};