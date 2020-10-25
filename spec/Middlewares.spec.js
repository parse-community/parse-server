const middlewares = require('../lib/middlewares');
const AppCache = require('../lib/cache').AppCache;

describe('middlewares', () => {
  let fakeReq, fakeRes;

  beforeEach(() => {
    fakeReq = {
      originalUrl: 'http://example.com/parse/',
      url: 'http://example.com/',
      body: {
        _ApplicationId: 'FakeAppId',
      },
      headers: {},
      get: key => {
        return fakeReq.headers[key.toLowerCase()];
      },
    };
    fakeRes = jasmine.createSpyObj('fakeRes', ['end', 'status']);
    AppCache.put(fakeReq.body._ApplicationId, {});
  });

  afterEach(() => {
    AppCache.del(fakeReq.body._ApplicationId);
  });

  it('should use _ContentType if provided', done => {
    expect(fakeReq.headers['content-type']).toEqual(undefined);
    const contentType = 'image/jpeg';
    fakeReq.body._ContentType = contentType;
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeReq.headers['content-type']).toEqual(contentType);
      expect(fakeReq.body._ContentType).toEqual(undefined);
      done();
    });
  });

  it('should give invalid response when keys are configured but no key supplied', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey',
    });
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should give invalid response when keys are configured but supplied key is incorrect', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey',
    });
    fakeReq.headers['x-parse-rest-api-key'] = 'wrongKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should give invalid response when keys are configured but different key is supplied', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey',
    });
    fakeReq.headers['x-parse-client-key'] = 'clientKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should succeed when any one of the configured keys supplied', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      clientKey: 'clientKey',
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey',
    });
    fakeReq.headers['x-parse-rest-api-key'] = 'restAPIKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should succeed when client key supplied but empty', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      clientKey: '',
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey',
    });
    fakeReq.headers['x-parse-client-key'] = '';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should succeed when no keys are configured and none supplied', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
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
    javascriptKey: '_JavaScriptKey',
  };

  const BodyKeys = Object.keys(BodyParams);

  BodyKeys.forEach(infoKey => {
    const bodyKey = BodyParams[infoKey];
    const keyValue = 'Fake' + bodyKey;
    // javascriptKey is the only one that gets defaulted,
    const otherKeys = BodyKeys.filter(
      otherKey => otherKey !== infoKey && otherKey !== 'javascriptKey'
    );

    it(`it should pull ${bodyKey} into req.info`, done => {
      fakeReq.body[bodyKey] = keyValue;

      middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
        expect(fakeReq.body[bodyKey]).toEqual(undefined);
        expect(fakeReq.info[infoKey]).toEqual(keyValue);

        otherKeys.forEach(otherKey => {
          expect(fakeReq.info[otherKey]).toEqual(undefined);
        });

        done();
      });
    });
  });

  it('should not succeed if the ip does not belong to masterKeyIps list', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1', 'ip2'],
    });
    fakeReq.ip = 'ip3';
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should succeed if the ip does belong to masterKeyIps list', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1', 'ip2'],
    });
    fakeReq.ip = 'ip1';
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should not succeed if the connection.remoteAddress does not belong to masterKeyIps list', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1', 'ip2'],
    });
    fakeReq.connection = { remoteAddress: 'ip3' };
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should succeed if the connection.remoteAddress does belong to masterKeyIps list', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1', 'ip2'],
    });
    fakeReq.connection = { remoteAddress: 'ip1' };
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should not succeed if the socket.remoteAddress does not belong to masterKeyIps list', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1', 'ip2'],
    });
    fakeReq.socket = { remoteAddress: 'ip3' };
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should succeed if the socket.remoteAddress does belong to masterKeyIps list', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1', 'ip2'],
    });
    fakeReq.socket = { remoteAddress: 'ip1' };
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should not succeed if the connection.socket.remoteAddress does not belong to masterKeyIps list', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1', 'ip2'],
    });
    fakeReq.connection = { socket: { remoteAddress: 'ip3' } };
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should succeed if the connection.socket.remoteAddress does belong to masterKeyIps list', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1', 'ip2'],
    });
    fakeReq.connection = { socket: { remoteAddress: 'ip1' } };
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should allow any ip to use masterKey if masterKeyIps is empty', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: [],
    });
    fakeReq.ip = 'ip1';
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should succeed if xff header does belong to masterKeyIps', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1'],
    });
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    fakeReq.headers['x-forwarded-for'] = 'ip1, ip2, ip3';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should succeed if xff header with one ip does belong to masterKeyIps', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1'],
    });
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    fakeReq.headers['x-forwarded-for'] = 'ip1';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeRes.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('should not succeed if xff header does not belong to masterKeyIps', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip4'],
    });
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    fakeReq.headers['x-forwarded-for'] = 'ip1, ip2, ip3';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should not succeed if xff header is empty and masterKeyIps is set', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['ip1'],
    });
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    fakeReq.headers['x-forwarded-for'] = '';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should properly expose the headers', () => {
    const headers = {};
    const res = {
      header: (key, value) => {
        headers[key] = value;
      },
    };
    const allowCrossDomain = middlewares.allowCrossDomain(fakeReq.body._ApplicationId);
    allowCrossDomain(fakeReq, res, () => {});
    expect(Object.keys(headers).length).toBe(4);
    expect(headers['Access-Control-Expose-Headers']).toBe(
      'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id'
    );
  });

  it('should set default Access-Control-Allow-Headers if allowHeaders are empty', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      allowHeaders: undefined,
    });
    const headers = {};
    const res = {
      header: (key, value) => {
        headers[key] = value;
      },
    };
    const allowCrossDomain = middlewares.allowCrossDomain(fakeReq.body._ApplicationId);
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Headers']).toContain(middlewares.DEFAULT_ALLOWED_HEADERS);

    AppCache.put(fakeReq.body._ApplicationId, {
      allowHeaders: [],
    });
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Headers']).toContain(middlewares.DEFAULT_ALLOWED_HEADERS);
  });

  it('should append custom headers to Access-Control-Allow-Headers if allowHeaders provided', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      allowHeaders: ['Header-1', 'Header-2'],
    });
    const headers = {};
    const res = {
      header: (key, value) => {
        headers[key] = value;
      },
    };
    const allowCrossDomain = middlewares.allowCrossDomain(fakeReq.body._ApplicationId);
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Headers']).toContain('Header-1, Header-2');
    expect(headers['Access-Control-Allow-Headers']).toContain(middlewares.DEFAULT_ALLOWED_HEADERS);
  });

  it('should set default Access-Control-Allow-Origin if allowOrigin is empty', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      allowOrigin: undefined,
    });
    const headers = {};
    const res = {
      header: (key, value) => {
        headers[key] = value;
      },
    };
    const allowCrossDomain = middlewares.allowCrossDomain(fakeReq.body._ApplicationId);
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Origin']).toEqual('*');
  });

  it('should set custom origin to Access-Control-Allow-Origin if allowOrigin is provided', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      allowOrigin: 'https://parseplatform.org/',
    });
    const headers = {};
    const res = {
      header: (key, value) => {
        headers[key] = value;
      },
    };
    const allowCrossDomain = middlewares.allowCrossDomain(fakeReq.body._ApplicationId);
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Origin']).toEqual('https://parseplatform.org/');
  });

  it('should use user provided on field userFromJWT', done => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
    });
    fakeReq.userFromJWT = 'fake-user';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeReq.auth.user).toEqual('fake-user');
      done();
    });
  });

  it('should give invalid response when upload file without x-parse-application-id in header', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
    });
    fakeReq.body = Buffer.from('fake-file');
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });
});
