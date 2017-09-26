'use strict';
/* Tests for ParseServer.js */
var express = require('express');

import ParseServer from '../src/ParseServer';

describe('Server Url Checks', () => {

  var app = express();
  app.get('/health', function(req, res){
    res.send('OK');
  });
  app.listen(13376);

  it('validate good server url', (done) => {
    reconfigureServer({
      serverURL: 'http://localhost:13376'
    }).then(function() {
      ParseServer.verifyServerUrl(function(result) {
        if(!result) {
          done.fail('Did not pass valid url');
        }
        done();
      });
    });
  });

  it('mark bad server url', (done) => {
    reconfigureServer({
      serverURL: 'notavalidurl'
    }).then(function() {
      ParseServer.verifyServerUrl(function(result) {
        if(result) {
          done.fail('Did not mark invalid url');
        }
        done();
      });
    });
  });
});
