import log from './logger';
const URL = require('url');

function maskSensitiveBody(url, method, body) {
  let maskBody = Object.assign({}, body);
  let shouldMaskBody = (method === 'POST' && url.endsWith('/users')
                       && !url.includes('classes')) ||
                       (method === 'PUT' && /users\/\w+$/.test(url)
                       && !url.includes('classes')) ||
                       (url.includes('classes/_User'));
  if (shouldMaskBody) {
    for (let key of Object.keys(maskBody)) {
      if (key == 'password') {
        maskBody[key] = '********';
        break;
      }
    }
  }
  return maskBody;
}

function maskSensitiveUrl(url, method, body) {
  let maskUrl = url.toString();
  let shouldMaskUrl = method === 'GET' && url.includes('/login')
                      && !url.includes('classes');
  if (shouldMaskUrl) {
    let password = URL.parse(url, true).query.password;
    if (password) {
      maskUrl = maskUrl.replace('password=' + password, 'password=********')
    }
  }
  return maskUrl;
}

export function logRequest(url, method, body, headers) {
  url = maskSensitiveUrl(url, method, body);
  body = maskSensitiveBody(url, method, body);
  let stringifiedBody = JSON.stringify(body, null, 2);
  log.verbose(`REQUEST for [${method}] ${url}: ${stringifiedBody}`, {
    method: method,
    url: url,
    headers: headers,
    body: body
  });
}

export function logResponse(url, method, body) {
    url = maskSensitiveUrl(url, method, body);
    body = maskSensitiveBody(url, method, body);
    let stringifiedResponse = JSON.stringify(body, null, 2);
    log.verbose(
      `RESPONSE from [${method}] ${url}: ${stringifiedResponse}`,
      {result: body}
    );
}
