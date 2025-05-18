'use strict';
/* Tests for ParseServer.js */
const express = require('express');
const ParseServer = require('../lib/ParseServer').default;
const path = require('path');
const { spawn } = require('child_process');

describe('Server Url Checks', () => {
  let server;
  beforeEach(done => {
    if (!server) {
      const app = express();
      app.get('/health', function (req, res) {
        res.json({
          status: 'ok',
        });
      });
      server = app.listen(13376, undefined, done);
    } else {
      done();
    }
  });

  afterAll(done => {
    Parse.serverURL = 'http://localhost:8378/1';
    server.close(done);
  });

  it('validate good server url', async () => {
    Parse.serverURL = 'http://localhost:13376';
    const response = await ParseServer.verifyServerUrl();
    expect(response).toBeTrue();
  });

  it('mark bad server url', async () => {
    spyOn(console, 'warn').and.callFake(() => {});
    Parse.serverURL = 'notavalidurl';
    const response = await ParseServer.verifyServerUrl();
    expect(response).not.toBeTrue();
    expect(console.warn).toHaveBeenCalledWith(
      `\nWARNING, Unable to connect to 'notavalidurl' as the URL is invalid. Cloud code and push notifications may be unavailable!\n`
    );
  });

  it('does not have unhandled promise rejection in the case of load error', done => {
    const parseServerProcess = spawn(path.resolve(__dirname, './support/FailingServer.js'));
    let stdout;
    let stderr;
    parseServerProcess.stdout.on('data', data => {
      stdout = data.toString();
    });
    parseServerProcess.stderr.on('data', data => {
      stderr = data.toString();
    });
    parseServerProcess.on('close', async code => {
      expect(code).toEqual(1);
      expect(stdout).not.toContain('UnhandledPromiseRejectionWarning');
      expect(stderr).toContain('MongoServerSelectionError');
      await reconfigureServer();
      done();
    });
  });
});
