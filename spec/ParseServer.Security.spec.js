'use strict';
const Parse = require('parse/node');
const request = require('../lib/request');

const defaultHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'Content-Type': 'application/json',
};
const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'X-Parse-Master-Key': 'test',
  'Content-Type': 'application/json',
};
const defaultOptions = {
  headers: defaultHeaders,
  json: true,
};
const masterKeyOptions = {
  headers: masterKeyHeaders,
  json: true,
};

describe('SecurityChecks', () => {
  it('should reject access when not using masterKey (/securityChecks)', done => {
    request(
      Object.assign({ url: Parse.serverURL + '/securityChecks' }, defaultOptions)
    ).then(done.fail, () => done());
  });
  it('should reject access by default to  /securityChecks, even with masterKey', done => {
    request(
      Object.assign({ url: Parse.serverURL + '/securityChecks' }, masterKeyOptions)
    ).then(done.fail, () => done());
  });
  it('can get security advice', async done => {
    await reconfigureServer({
      securityChecks: {
        enableSecurityChecks: true,
        enableLogOutput: true,
      },
    });
    const options = Object.assign({}, masterKeyOptions, {
      method: 'GET',
      url: Parse.serverURL + '/securityChecks',
    });
    request(options).then(res => {
      expect(res.data.CLP).not.toBeUndefined();
      expect(res.data.ServerConfiguration).not.toBeUndefined();
      expect(res.data.Database).not.toBeUndefined();
      expect(res.data.Total).not.toBeUndefined();
      done();
    });
  });

  it('can get security on start', async done => {
    await reconfigureServer({
      securityChecks: {
        enableSecurityChecks: true,
        enableLogOutput: true,
      },
    });
    const logger = require('../lib/logger').logger;
    spyOn(logger, 'warn').and.callFake(() => {});
    await new Promise(resolve => {
      setTimeout(resolve, 2000);
    });
    let messagesCalled = '';
    for (const item in logger.warn.calls.all()) {
      const call = logger.warn.calls.all()[item];
      messagesCalled = messagesCalled + ' ' + (call.args || []).join(' ');
    }
    expect(messagesCalled).toContain('Clients are currently allowed to create new classes.');
    done();
  });
});
