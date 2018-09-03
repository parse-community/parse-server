import request from 'request';
import HTTPResponse from './HTTPResponse';
import querystring from 'querystring';
import log from '../logger';

var encodeBody = function({ body, headers = {} }) {
  if (typeof body !== 'object') {
    return { body, headers };
  }
  var contentTypeKeys = Object.keys(headers).filter(key => {
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
      log.error(
        'Parse.Cloud.httpRequest',
        'multiple content-type headers are set.'
      );
    }
    // There maybe many, we'll just take the 1st one
    var contentType = contentTypeKeys[0];
    if (headers[contentType].match(/application\/json/i)) {
      body = JSON.stringify(body);
    } else if (
      headers[contentType].match(/application\/x-www-form-urlencoded/i)
    ) {
      body = querystring.stringify(body);
    }
  }
  return { body, headers };
};

/**
 * Makes an HTTP Request.
 *
 * **Available in Cloud Code only.**
 *
 * By default, Parse.Cloud.httpRequest does not follow redirects caused by HTTP 3xx response codes. You can use the followRedirects option in the {@link Parse.Cloud.HTTPOptions} object to change this behavior.
 *
 * Sample request:
 * ```
 * Parse.Cloud.httpRequest({
 *   url: 'http://www.parse.com/'
 * }).then(function(httpResponse) {
 *   // success
 *   console.log(httpResponse.text);
 * },function(httpResponse) {
 *   // error
 *   console.error('Request failed with response code ' + httpResponse.status);
 * });
 * ```
 *
 * @method httpRequest
 * @name Parse.Cloud.httpRequest
 * @param {Parse.Cloud.HTTPOptions} options The Parse.Cloud.HTTPOptions object that makes the request.
 * @return {Promise<Parse.Cloud.HTTPResponse>} A promise that will be resolved with a {@link Parse.Cloud.HTTPResponse} object when the request completes.
 */
module.exports = function(options) {
  var callbacks = {
    success: options.success,
    error: options.error,
  };
  delete options.success;
  delete options.error;
  delete options.uri; // not supported
  options = Object.assign(options, encodeBody(options));
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
  return new Promise((resolve, reject) => {
    request(options, (error, response, body) => {
      if (error) {
        if (callbacks.error) {
          callbacks.error(error);
        }
        return reject(error);
      }
      const httpResponse = new HTTPResponse(response, body);

      // Consider <200 && >= 400 as errors
      if (httpResponse.status < 200 || httpResponse.status >= 400) {
        if (callbacks.error) {
          callbacks.error(httpResponse);
        }
        return reject(httpResponse);
      } else {
        if (callbacks.success) {
          callbacks.success(httpResponse);
        }
        return resolve(httpResponse);
      }
    });
  });
};

/**
 * @typedef Parse.Cloud.HTTPOptions
 * @property {String|Object} body The body of the request. If it is a JSON object, then the Content-Type set in the headers must be application/x-www-form-urlencoded or application/json. You can also set this to a {@link Buffer} object to send raw bytes. If you use a Buffer, you should also set the Content-Type header explicitly to describe what these bytes represent.
 * @property {function} error The function that is called when the request fails. It will be passed a Parse.Cloud.HTTPResponse object.
 * @property {Boolean} followRedirects Whether to follow redirects caused by HTTP 3xx responses. Defaults to false.
 * @property {Object} headers The headers for the request.
 * @property {String} method The method of the request. GET, POST, PUT, DELETE, HEAD, and OPTIONS are supported. Will default to GET if not specified.
 * @property {String|Object} params The query portion of the url. You can pass a JSON object of key value pairs like params: {q : 'Sean Plott'} or a raw string like params:q=Sean Plott.
 * @property {function} success The function that is called when the request successfully completes. It will be passed a Parse.Cloud.HTTPResponse object.
 * @property {string} url The url to send the request to.
 */

module.exports.encodeBody = encodeBody;
