var request = require("request"),
  querystring = require('querystring'),
  Parse = require('parse/node').Parse;

var encodeBody = function(body, headers = {}) {
  if (typeof body !== 'object') {
    return body;
  }
  var contentTypeKeys = Object.keys(headers).filter((key) => {
    return key.match(/content-type/i) != null;
  });

  if (contentTypeKeys.length == 1) {
    var contentType = contentTypeKeys[0];
    if (headers[contentType].match(/application\/json/i)) {
      body = JSON.stringify(body);
    } else if(headers[contentType].match(/application\/x-www-form-urlencoded/i)) {
      body = Object.keys(body).map(function(key){
        return `${key}=${encodeURIComponent(body[key])}`
      }).join("&");
    }
  }
  return body;
}

module.exports = function(options) {
  var promise = new Parse.Promise();
  var callbacks = {
    success: options.success,
    error: options.error
  };
  delete options.success;
  delete options.error;
  delete options.uri; // not supported
  options.body = encodeBody(options.body, options.headers);
  // set follow redirects to false by default
  options.followRedirect = options.followRedirects == true;
  // support params options
  if (typeof options.params === 'object') {
    options.qs = options.params;
  } else if (typeof options.params === 'string') {
    options.qs = querystring.parse(options.params);
  }

  request(options, (error, response, body) => {
    if (error) {
      if (callbacks.error) {
        callbacks.error(error);
      }
      return promise.reject(error);
    }
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
    if (httpResponse.status < 200 || httpResponse.status >= 400) {
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

module.exports.encodeBody = encodeBody;
