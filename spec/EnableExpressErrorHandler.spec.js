const ParseServer = require('../lib/index');
const express = require('express');
const request = require('../lib/request');

describe('Enable express error handler', () => {
  it('should call the default handler in case of error, like updating a non existing object', done => {
    const serverUrl = 'http://localhost:12667/parse';
    const appId = 'anOtherTestApp';
    const masterKey = 'anOtherTestMasterKey';
    let server;

    let lastError;

    const parseServer = ParseServer.ParseServer(
      Object.assign({}, defaultConfiguration, {
        appId: appId,
        masterKey: masterKey,
        serverURL: serverUrl,
        enableExpressErrorHandler: true,
        serverStartComplete: () => {
          expect(Parse.applicationId).toEqual('anOtherTestApp');
          const app = express();
          app.use('/parse', parseServer);

          server = app.listen(12667);

          app.use(function(err, req, res, next) {
            next;
            lastError = err;
          });

          request({
            method: 'PUT',
            url: serverUrl + '/classes/AnyClass/nonExistingId',
            headers: {
              'X-Parse-Application-Id': appId,
              'X-Parse-Master-Key': masterKey,
              'Content-Type': 'application/json',
            },
            body: { someField: 'blablabla' },
          })
            .then(() => {
              fail('Should throw error');
            })
            .catch(response => {
              const reqError = response.data;
              expect(reqError).toBeDefined();
              expect(lastError).toBeDefined();

              expect(lastError.code).toEqual(101);
              expect(lastError.message).toEqual('Object not found.');

              expect(lastError.code).toEqual(reqError.code);
              expect(lastError.message).toEqual(reqError.error);
            })
            .then(() => {
              server.close(done);
            });
        },
      })
    );
  });
});
