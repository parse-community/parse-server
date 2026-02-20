const https = require('https');
const http = require('http');
const { isJsonString } = require('../../../src/Utils');

const requestProtocol = {
  http,
  https,
};

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
        if (!isJsonString(data)) {
          throw new Error('Invalid response; response should be JSON');
        }
        data = JSON.parse(data);
      } catch (e) {
        return reject(e);
      }
      resolve(data);
    });
    res.on('error', reject);
  };
}

function get(options, protocol = 'https', noJSON = false) {
  return new Promise((resolve, reject) => {
    requestProtocol[protocol]
      .get(options, makeCallback(resolve, reject, noJSON))
      .on('error', reject);
  });
}

function request(options, postData, protocol = 'https') {
  return new Promise((resolve, reject) => {
    const req = requestProtocol[protocol].request(options, makeCallback(resolve, reject));
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = { get, request };
