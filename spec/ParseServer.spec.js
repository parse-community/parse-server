'use strict';
/* Tests for ParseServer.js */
const express = require('express');

import ParseServer from '../src/ParseServer';

describe('Server Url Checks', () => {

  const app = express();
  app.get('/health', function(req, res){
    res.send('OK');
  });
  app.listen(13376);

  it('validate good server url', (done) => {
    Parse.serverURL = 'http://localhost:13376';
    ParseServer.verifyServerUrl(function(result) {
      if(!result) {
        done.fail('Did not pass valid url');
      }
      done();
    });
  });

  it('mark bad server url', (done) => {
    Parse.serverURL = 'notavalidurl';
    ParseServer.verifyServerUrl(function(result) {
      if(result) {
        done.fail('Did not mark invalid url');
      }
      done();
    });
  });
});
