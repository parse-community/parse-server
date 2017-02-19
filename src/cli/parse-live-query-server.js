import definitions from './definitions/parse-live-query-server';
import runner from './utils/runner';
import { ParseServer } from '../index';
import express from 'express';

runner({
  definitions,
  start: function(program, options, logOptions) {
    logOptions();
    var app = express();
    var httpServer = require('http').createServer(app);
    httpServer.listen(options.port);
    ParseServer.createLiveQueryServer(httpServer,  options);
  }
})
