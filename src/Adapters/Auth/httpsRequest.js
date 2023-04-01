const https = require('https');

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

module.exports = { get, request };
