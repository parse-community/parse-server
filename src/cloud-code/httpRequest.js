var request = require("request"),
  querystring = require('querystring'),
  Parse = require('parse/node').Parse;
  HTTPResponse = require('./HTTPResponse').HTTPResponse;

var encodeBody = function(options = {}) {
  let body = options.body;
  let headers = options.headers || {};
  if (typeof body !== 'object') {
    return options;
  }
  var contentTypeKeys = Object.keys(headers).filter((key) => {
    return key.match(/content-type/i) != null;
  });

  if (contentTypeKeys.length == 0) {
    // no content type
    try {
      options.body = JSON.stringify(body);
      options.headers = options.headers || {};
      options.headers['Content-Type'] = 'application/json';
    } catch(e) {
      // do nothing;
    }
  } else if (contentTypeKeys.length == 1) {
    var contentType = contentTypeKeys[0];
    if (headers[contentType].match(/application\/json/i)) {
      options.body = JSON.stringify(body);
    } else if(headers[contentType].match(/application\/x-www-form-urlencoded/i)) {
      options.body = Object.keys(body).map(function(key){
        return `${key}=${encodeURIComponent(body[key])}`
      }).join("&");
    }
  }
  return options;
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
  options = encodeBody(options);
  // set follow redirects to false by default
  options.followRedirect = options.followRedirects == true;
  // support params options
  if (typeof options.params === 'object') {
    options.qs = options.params;
  } else if (typeof options.params === 'string') {
    options.qs = querystring.parse(options.params);
  }
  // force the response as a buffer
  options.encoding = null;

  request(options, (error, response, body) => {
    if (error) {
      if (callbacks.error) {
        callbacks.error(error);
      }
      return promise.reject(error);
    }
    let httpResponse = new HTTPResponse(response);
    
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
