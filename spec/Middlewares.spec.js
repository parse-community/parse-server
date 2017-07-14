var middlewares = require('../src/middlewares');
var AppCache = require('../src/cache').AppCache;

describe('middlewares', () => {

  var fakeReq, fakeRes;

  beforeEach(() => {
    fakeReq = {
      originalUrl: 'http://example.com/parse/',
      url: 'http://example.com/',
      body: {
        _ApplicationId: 'FakeAppId'
      },
      headers: {},
      get: (key) => {
        return fakeReq.headers[key.toLowerCase()]
      }
    };
    fakeRes = jasmine.createSpyObj('fakeRes', ['end', 'status']);
    AppCache.put(fakeReq.body._ApplicationId, {});
  });

  afterEach(() => {
    AppCache.del(fakeReq.body._ApplicationId);
  });

  it('should use _ContentType if provided', (done) => {
    expect(fakeReq.headers['content-type']).toEqual(undefined);
    var contentType = 'image/jpeg';
    fakeReq.body._ContentType = contentType;
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeReq.headers['content-type']).toEqual(contentType);
      expect(fakeReq.body._ContentType).toEqual(undefined);
      done()
    });
  });

  it('should give invalid response when keys are configured but no key supplied', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey'
    });
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should give invalid response when keys are configured but supplied key is incorrect', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey'
    });
    fakeReq.headers['x-parse-rest-api-key'] = 'wrongKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should give invalid response when keys are configured but different key is supplied', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey'
    });
    fakeReq.headers['x-parse-client-key'] = 'clientKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });


  it('should succeed when any one of the configured keys supplied', (done) => {
    AppCache.put(fakeReq.body._ApplicationId, {
      clientKey: 'clientKey',
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey'
    });
    fakeReq.headers['x-parse-rest-api-key'] = 'restAPIKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should succeed when client key supplied but empty', (done) => {
    AppCache.put(fakeReq.body._ApplicationId, {
      clientKey: '',
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey'
    });
    fakeReq.headers['x-parse-client-key'] = '';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should succeed when no keys are configured and none supplied', (done) => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey'
    });
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  const BodyParams = {
    clientVersion: '_ClientVersion',
    installationId: '_InstallationId',
    sessionToken: '_SessionToken',
    masterKey: '_MasterKey',
    javascriptKey: '_JavaScriptKey'
  };

  const BodyKeys = Object.keys(BodyParams);

  BodyKeys.forEach((infoKey) => {
    const bodyKey = BodyParams[infoKey];
    const keyValue = 'Fake' + bodyKey;
    // javascriptKey is the only one that gets defaulted,
    const otherKeys = BodyKeys.filter((otherKey) => otherKey !== infoKey && otherKey !== 'javascriptKey');

    it(`it should pull ${bodyKey} into req.info`, (done) => {
      fakeReq.body[bodyKey] = keyValue;

      middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
        expect(fakeReq.body[bodyKey]).toEqual(undefined);
        expect(fakeReq.info[infoKey]).toEqual(keyValue);

        otherKeys.forEach((otherKey) => {
          expect(fakeReq.info[otherKey]).toEqual(undefined);
        });

        done();
      });
    });
  });

//  it('should not succeed if the masterKey is not match', (done) => {
//    AppCache.put(fakeReq.body._ApplicationId, {
//      clientKey: 'clientKey',
//      masterKey: 'masterKey',
//      restAPIKey: 'restAPIKey'
//    });
//    fakeReq.headers['x-parse-master-key'] = 'restAPIKey';
//    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
//      expect(fakeRes.status).toHaveBeenCalledWith(403);
//      done();
//    });
//  });

//  it('should not allow to use masterKey if not in the masterKeyIps list', (done) => {
//    
//  });

});
