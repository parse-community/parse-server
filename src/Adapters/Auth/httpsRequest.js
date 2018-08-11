const https = require('https');

function makeCallback(resolve, reject) {
  return function(res) {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        data = JSON.parse(data);
      } catch(e) {
        return reject(e);
      }
      resolve(data);
    });
    res.on('error', reject);
  };
}

// A promisey wrapper for FB graph requests.
function get(path) {
  return new Promise((resolve, reject) => {
    https
      .get(path, makeCallback(resolve, reject))
      .on('error', reject);
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
