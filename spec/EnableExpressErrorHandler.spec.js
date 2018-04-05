const ParseServer = require("../src/index");
const express = require('express');
const rp = require('request-promise');

describe('Enable express error handler', () => {
  beforeEach((done) => {
    reconfigureServer({
      enableExpressErrorHandler: true,
      schemaCacheTTL: 30000
    }).then(() => {
      done();
    });
  });

  it('should call the default handler in case of error, like updating a non existing object', done => {
    const serverUrl = "http://localhost:12667/parse"
    const appId = "anOtherTestApp";
    const masterKey = "anOtherTestMasterKey";
    let server;

    let lastError;

    const parseServer = ParseServer.ParseServer(Object.assign({},
      defaultConfiguration, {
        appId: appId,
        masterKey: masterKey,
        serverURL: serverUrl,
        enableExpressErrorHandler: true,
        __indexBuildCompletionCallbackForTests: promise => {
          promise
            .then(() => {
              expect(Parse.applicationId).toEqual("anOtherTestApp");
              const app = express();
              app.use('/parse', parseServer);

              server = app.listen(12667);

              app.use(function (err, req, res, next) {
                next
                lastError = err
              })

              rp({
                method: 'PUT',
                uri: serverUrl + '/classes/AnyClass/nonExistingId',
                headers: {
                  'X-Parse-Application-Id': appId,
                  'X-Parse-Master-Key': masterKey
                },
                body: { someField: "blablabla"},
                json: true
              })
                .then(() => {
                  fail('Should throw error');
                })
                .catch(e => {
                  expect(e).toBeDefined();
                  expect(lastError).toBeDefined();
                })
                .then(() => {
                  server.close(done);
                });
            })
        }}
    ));
  });

});

