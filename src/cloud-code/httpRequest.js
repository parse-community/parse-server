import request from 'request';
import Parse from 'parse/node';
import HTTPResponse from './HTTPResponse';
import querystring from 'querystring';

var encodeBody = function({body, headers = {}}) {
  if (typeof body !== 'object') {
    return {body, headers};
  }
  var contentTypeKeys = Object.keys(headers).filter((key) => {
    return key.match(/content-type/i) != null;
  });

  if (contentTypeKeys.length == 0) {
    // no content type
    try {
      body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    } catch(e) {
      // do nothing;
    }
  } else {
    /* istanbul ignore next */
    if (contentTypeKeys.length > 1) {
      console.error('multiple content-type headers are set.');
    }
    // There maybe many, we'll just take the 1st one
    var contentType = contentTypeKeys[0];
    if (headers[contentType].match(/application\/json/i)) {
      body = JSON.stringify(body);
    } else if(headers[contentType].match(/application\/x-www-form-urlencoded/i)) {
      body = Object.keys(body).map(function(key){
        return `${key}=${encodeURIComponent(body[key])}`
      }).join("&");
    }
  }
  return {body, headers};
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
  options = Object.assign(options,  encodeBody(options));
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
