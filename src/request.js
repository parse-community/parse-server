import querystring from 'querystring';
import log from './logger';
import { http, https } from 'follow-redirects';
import { parse } from 'url';

class HTTPResponse {
  constructor(response, body) {
    let _text, _data;
    this.status = response.statusCode;
    this.headers = response.headers || {};
    this.cookies = this.headers['set-cookie'];

    if (typeof body == 'string') {
      _text = body;
    } else if (Buffer.isBuffer(body)) {
      this.buffer = body;
    } else if (typeof body == 'object') {
      _data = body;
    }

    const getText = () => {
      if (!_text && this.buffer) {
        _text = this.buffer.toString('utf-8');
      } else if (!_text && _data) {
        _text = JSON.stringify(_data);
      }
      return _text;
    };

    const getData = () => {
      if (!_data) {
        try {
          _data = JSON.parse(getText());
        } catch (e) {
          /* */
        }
      }
      return _data;
    };

    Object.defineProperty(this, 'body', {
      get: () => {
        return body;
      },
    });

    Object.defineProperty(this, 'text', {
      enumerable: true,
      get: getText,
    });

    Object.defineProperty(this, 'data', {
      enumerable: true,
      get: getData,
    });
  }
}

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

function httpRequest(options) {
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
}
module.exports = httpRequest;
module.exports.encodeBody = encodeBody;
module.exports.HTTPResponse = HTTPResponse;
