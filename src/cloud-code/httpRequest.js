import HTTPResponse from './HTTPResponse';
import querystring from 'querystring';
import log from '../logger';
import { http, https } from 'follow-redirects';
import { parse } from 'url';

const clients = {
  'http:': http,
  'https:': https,
};

function makeCallback(resolve, reject) {
  return function (response) {
    const chunks = [];
    response.on('data', chunk => {
      chunks.push(chunk);
    });
    response.on('end', () => {
      const body = Buffer.concat(chunks);
      const httpResponse = new HTTPResponse(response, body);

      // Consider <200 && >= 400 as errors
      if (httpResponse.status < 200 || httpResponse.status >= 400) {
        return reject(httpResponse);
      } else {
        return resolve(httpResponse);
      }
    });
    response.on('error', reject);
  };
}

const encodeBody = function ({ body, headers = {} }) {
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
      log.error('Parse.Cloud.httpRequest', 'multiple content-type headers are set.');
    }
    // There maybe many, we'll just take the 1st one
    var contentType = contentTypeKeys[0];
    if (headers[contentType].match(/application\/json/i)) {
      body = JSON.stringify(body);
    } else if (headers[contentType].match(/application\/x-www-form-urlencoded/i)) {
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
 * @param {Object} options axios object for options
 * @return {Promise<Object>} axios response object
 */
import axios from 'axios';
import { parse as qs } from 'querystring';
module.exports = async options => {
  if (options.method) {
    options.method = options.method.toLowerCase();
  }
  if (options.body) {
    options.data = options.body;
    delete options.body;
  }
  if (typeof options.params === 'object') {
    options.qs = options.params;
  } else if (typeof options.params === 'string') {
    options.qs = qs(options.params);
  }
  if (options.qs) {
    options.params = options.qs;
    delete options.qs;
  }
  if (!options.followRedirects) {
    options.maxRedirects = 0;
    delete options.followRedirects;
  }
  try {
    const response = await axios(options);
    const data = response.data;
    if (Object.prototype.toString.call(data) === '[object Object]') {
      response.text = JSON.stringify(data);
      response.data = data;
    } else {
      response.text = data;
    }
    response.buffer = Buffer.from(response.text);
    return response;
  } catch (e) {
    e.status = e.response && e.response.status;
    const data = e.response && e.response.data;
    if (Object.prototype.toString.call(data) === '[object Object]') {
      e.text = JSON.stringify(data);
      e.data = data;
    } else {
      e.text = data;
    }
    e.buffer = Buffer.from(e.text);
    if (e.response && e.response.headers) {
      e.headers = e.response.headers;
    }
    if (e.status === 301 || e.status === 302 || e.status === 303) {
      return e;
    }
    throw e;
  }
};
module.exports.legacy = function httpRequest(options) {
  let url;
  try {
    url = parse(options.url);
  } catch (e) {
    return Promise.reject(e);
  }
  options = Object.assign(options, encodeBody(options));
  // support params options
  if (typeof options.params === 'object') {
    options.qs = options.params;
  } else if (typeof options.params === 'string') {
    options.qs = querystring.parse(options.params);
  }
  const client = clients[url.protocol];
  if (!client) {
    return Promise.reject(`Unsupported protocol ${url.protocol}`);
  }
  const requestOptions = {
    method: options.method,
    port: Number(url.port),
    path: url.pathname,
    hostname: url.hostname,
    headers: options.headers,
    encoding: null,
    followRedirects: options.followRedirects === true,
  };
  if (requestOptions.headers) {
    Object.keys(requestOptions.headers).forEach(key => {
      if (typeof requestOptions.headers[key] === 'undefined') {
        delete requestOptions.headers[key];
      }
    });
  }
  if (url.search) {
    options.qs = Object.assign({}, options.qs, querystring.parse(url.query));
  }
  if (url.auth) {
    requestOptions.auth = url.auth;
  }
  if (options.qs) {
    requestOptions.path += `?${querystring.stringify(options.qs)}`;
  }
  if (options.agent) {
    requestOptions.agent = options.agent;
  }
  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, makeCallback(resolve, reject, options));
    if (options.body) {
      req.write(options.body);
    }
    req.on('error', error => {
      reject(error);
    });
    req.end();
  });
};

module.exports.encodeBody = encodeBody;
