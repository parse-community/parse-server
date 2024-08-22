const https = require('https');
const util = require('util');
const requestPromise = util.promisify(require('request'));
function makeCallback(resolve, reject, noJSON) {
  return function (res) {
    let data = '';
    res.on('data', chunk => {
      data += chunk;
    });
    res.on('end', () => {
      if (noJSON) {
        return resolve(data);
      }
      try {
        data = JSON.parse(data);
      } catch (e) {
        return reject(e);
      }
      resolve(data);
    });
    res.on('error', reject);
  };
}
function get(options, noJSON = false) {
  return new Promise((resolve, reject) => {
    https.get(options, makeCallback(resolve, reject, noJSON)).on('error', reject);
  });
}
function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, makeCallback(resolve, reject));
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
async function getAccessToken(options) {
  try {
    const response = await requestPromise(options);
    let accessTokenData = response.body;
    try {
      accessTokenData = jsonAndQueryStringParse(accessTokenData);
    } catch (error) {
      return error;
    }
    return accessTokenData;
  } catch (error) {
    return error;
  }
}
function parseQueryString(queryString) {
  if (!queryString || typeof queryString !== 'string') return queryString;
  const params = {};
  const pairs = queryString.split('&');
  pairs.forEach(pair => {
    const [key, value] = pair.split('=');
    params[key] = value;
  });
  return params;
}
function jsonAndQueryStringParse(str = '') {
  try {
    return JSON.parse(str);
  } catch (error) {
    return parseQueryString(str);
  }
}
module.exports = {
  get,
  request,
  getAccessToken,
  jsonAndQueryStringParse
};
