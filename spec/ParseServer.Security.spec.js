'use strict';
const Parse = require('parse/node');
const request = require('../lib/request');

const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'X-Parse-Master-Key': 'test',
  'Content-Type': 'application/json',
};
const masterKeyOptions = {
  headers: masterKeyHeaders,
  json: true,
};

describe('SecurityChecks', () => {
  it('can get security advice', async done => {
    await reconfigureServer({
      securityChecks: {
        enabled: true,
        logOutput: true,
      },
    });
    const options = Object.assign({}, masterKeyOptions, {
      method: 'GET',
      url: Parse.serverURL + '/securityChecks',
    });
    request(options).then(res => {
      expect(res.data.Security).not.toBeUndefined();
      expect(res.data.CLP).not.toBeUndefined();
      expect(res.data.Total).not.toBeUndefined();
      done();
    });
  });

  it('can get security on start', async done => {
    await reconfigureServer({
      securityChecks: {
        enabled: true,
        logOutput: true,
      },
    });
    const logger = require('../lib/logger').logger;
    spyOn(logger, 'warn').and.callFake(() => {});
    await new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, 2000);
    });
    expect(logger.warn.calls.mostRecent().args[0]).toContain(
      'Allow Client Class Creation is not recommended.'
    );
    done();
  });
});
