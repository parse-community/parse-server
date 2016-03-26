import request from 'request';
import Parse from 'parse/node';
import HTTPResponse from './HTTPResponse';
import querystring from 'querystring';
import log from '../logger';

var encodeBody = function({body, headers = {}}) {
  if (typeof body !== 'object') {
    return {body, headers};
  }
  var contentTypeKeys = Object.keys(headers).filter((key) => {
    return key.match(/content-type/i) != null;
  });

  if (contentTypeKeys.length == 0) {
    // no content type
    //  As per https://parse.com/docs/cloudcode/guide#cloud-code-advanced-sending-a-post-request the default encoding is supposedly x-www-form-urlencoded

    body = querystring.stringify(body);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else {
    /* istanbul ignore next */
    if (contentTypeKeys.length > 1) {
      log.error('Parse.Cloud.httpRequest', 'multiple content-type headers are set.');
    }
    // There maybe many, we'll just take the 1st one
    var contentType = contentTypeKeys[0];
    if (headers[contentType].match(/application\/json/i)) {
      body = JSON.stringify(body);
    } else if(headers[contentType].match(/application\/x-www-form-urlencoded/i)) {
      body = querystring.stringify(body);
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
