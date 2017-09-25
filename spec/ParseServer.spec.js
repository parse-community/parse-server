"use strict";
/* Tests for ParseServer.js */
var express = require('express');

import ParseServer          from '../src/ParseServer';

var app = express();
//app.use(bodyParser.json({ 'type': '*/*' }));
app.get("/health", function(req, res){
  res.send("OK");
});
app.listen(12345);

describe('Server Url Checks', () => {
  it("validate good publicServerUrl", (done) => {
    ParseServer.verifyServerUrl('http://localhost:12345', function(result) {
      if(!result) {
        jfail('Did not pass valid url');
      }
      done();
    });
  });

  it("mark bad publicServerUrl", (done) => {
    ParseServer.verifyServerUrl('not a valid url', function(result) {
      if(result) {
        jfail('Did not mark invalid url');
      }
      done();
    });
  });
});
