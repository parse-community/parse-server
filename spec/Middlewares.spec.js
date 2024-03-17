const middlewares = require('../lib/middlewares');
const AppCache = require('../lib/cache').AppCache;
const { BlockList } = require('net');

const AppCachePut = (appId, config) =>
  AppCache.put(appId, {
    ...config,
    maintenanceKeyIpsStore: new Map(),
    masterKeyIpsStore: new Map(),
  });

describe('middlewares', () => {
  let fakeReq, fakeRes;
  beforeEach(() => {
    fakeReq = {
      ip: '127.0.0.1',
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
    AppCachePut(fakeReq.body._ApplicationId, {});
  });

  afterEach(() => {
    AppCache.del(fakeReq.body._ApplicationId);
  });

  it('should use _ContentType if provided', done => {
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKeyIps: ['127.0.0.1'],
    });
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
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey',
    });
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should give invalid response when keys are configured but supplied key is incorrect', () => {
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey',
    });
    fakeReq.headers['x-parse-rest-api-key'] = 'wrongKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should give invalid response when keys are configured but different key is supplied', () => {
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      restAPIKey: 'restAPIKey',
    });
    fakeReq.headers['x-parse-client-key'] = 'clientKey';
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should succeed when any one of the configured keys supplied', done => {
    AppCachePut(fakeReq.body._ApplicationId, {
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
    AppCachePut(fakeReq.body._ApplicationId, {
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
    AppCachePut(fakeReq.body._ApplicationId, {
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
      AppCachePut(fakeReq.body._ApplicationId, {
        masterKeyIps: ['0.0.0.0/0'],
      });
      fakeReq.ip = '127.0.0.1';
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

  it('should not succeed and log if the ip does not belong to masterKeyIps list', async () => {
    const logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['10.0.0.1'],
    });
    fakeReq.ip = '127.0.0.1';
    fakeReq.headers['x-parse-master-key'] = 'masterKey';

    let error;

    try {
      await new Promise(resolve => middlewares.handleParseHeaders(fakeReq, fakeRes, resolve));
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toEqual(`unauthorized`);
    expect(logger.error).toHaveBeenCalledWith(
      `Request using master key rejected as the request IP address '127.0.0.1' is not set in Parse Server option 'masterKeyIps'.`
    );
  });

  it('should not succeed and log if the ip does not belong to maintenanceKeyIps list', async () => {
    const logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});
    AppCachePut(fakeReq.body._ApplicationId, {
      maintenanceKey: 'masterKey',
      maintenanceKeyIps: ['10.0.0.0', '10.0.0.1'],
    });
    fakeReq.ip = '10.0.0.2';
    fakeReq.headers['x-parse-maintenance-key'] = 'masterKey';

    let error;

    try {
      await new Promise(resolve => middlewares.handleParseHeaders(fakeReq, fakeRes, resolve));
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toEqual(`unauthorized`);
    expect(logger.error).toHaveBeenCalledWith(
      `Request using maintenance key rejected as the request IP address '10.0.0.2' is not set in Parse Server option 'maintenanceKeyIps'.`
    );
  });

  it('should succeed if the ip does belong to masterKeyIps list', async () => {
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['10.0.0.1'],
    });
    fakeReq.ip = '10.0.0.1';
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    await new Promise(resolve => middlewares.handleParseHeaders(fakeReq, fakeRes, resolve));
    expect(fakeReq.auth.isMaster).toBe(true);
  });

  it('should allow any ip to use masterKey if masterKeyIps is empty', async () => {
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
      masterKeyIps: ['0.0.0.0/0'],
    });
    fakeReq.ip = '10.0.0.1';
    fakeReq.headers['x-parse-master-key'] = 'masterKey';
    await new Promise(resolve => middlewares.handleParseHeaders(fakeReq, fakeRes, resolve));
    expect(fakeReq.auth.isMaster).toBe(true);
  });

  it('can set trust proxy', async () => {
    const server = await reconfigureServer({ trustProxy: 1 });
    expect(server.app.parent.settings['trust proxy']).toBe(1);
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
    AppCachePut(fakeReq.body._ApplicationId, {
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

    AppCachePut(fakeReq.body._ApplicationId, {
      allowHeaders: [],
    });
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Headers']).toContain(middlewares.DEFAULT_ALLOWED_HEADERS);
  });

  it('should append custom headers to Access-Control-Allow-Headers if allowHeaders provided', () => {
    AppCachePut(fakeReq.body._ApplicationId, {
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
    AppCachePut(fakeReq.body._ApplicationId, {
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
    AppCachePut(fakeReq.body._ApplicationId, {
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

  it('should support multiple origins if several are defined in allowOrigin as an array', () => {
    AppCache.put(fakeReq.body._ApplicationId, {
      allowOrigin: ['https://a.com', 'https://b.com', 'https://c.com'],
    });
    const headers = {};
    const res = {
      header: (key, value) => {
        headers[key] = value;
      },
    };
    const allowCrossDomain = middlewares.allowCrossDomain(fakeReq.body._ApplicationId);
    // Test with the first domain
    fakeReq.headers.origin = 'https://a.com';
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Origin']).toEqual('https://a.com');
    // Test with the second domain
    fakeReq.headers.origin = 'https://b.com';
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Origin']).toEqual('https://b.com');
    // Test with the third domain
    fakeReq.headers.origin = 'https://c.com';
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Origin']).toEqual('https://c.com');
    // Test with an unauthorized domain
    fakeReq.headers.origin = 'https://unauthorized.com';
    allowCrossDomain(fakeReq, res, () => {});
    expect(headers['Access-Control-Allow-Origin']).toEqual('https://a.com');
  });

  it('should use user provided on field userFromJWT', done => {
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
    });
    fakeReq.userFromJWT = 'fake-user';
    middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
      expect(fakeReq.auth.user).toEqual('fake-user');
      done();
    });
  });

  it('should give invalid response when upload file without x-parse-application-id in header', () => {
    AppCachePut(fakeReq.body._ApplicationId, {
      masterKey: 'masterKey',
    });
    fakeReq.body = Buffer.from('fake-file');
    middlewares.handleParseHeaders(fakeReq, fakeRes);
    expect(fakeRes.status).toHaveBeenCalledWith(403);
  });

  it('should match address', () => {
    const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    const anotherIpv6 = '::ffff:101.10.0.1';
    const ipv4 = '192.168.0.101';
    const localhostV6 = '::1';
    const localhostV62 = '::ffff:127.0.0.1';
    const localhostV4 = '127.0.0.1';

    const v6 = [ipv6, anotherIpv6];
    v6.forEach(ip => {
      expect(middlewares.checkIp(ip, ['::/0'], new Map())).toBe(true);
      expect(middlewares.checkIp(ip, ['::'], new Map())).toBe(true);
      expect(middlewares.checkIp(ip, ['0.0.0.0'], new Map())).toBe(false);
      expect(middlewares.checkIp(ip, ['0.0.0.0/0'], new Map())).toBe(false);
      expect(middlewares.checkIp(ip, ['123.123.123.123'], new Map())).toBe(false);
    });

    expect(middlewares.checkIp(ipv6, [anotherIpv6], new Map())).toBe(false);
    expect(middlewares.checkIp(ipv6, [ipv6], new Map())).toBe(true);
    expect(middlewares.checkIp(ipv6, ['2001:db8:85a3:0:0:8a2e:0:0/100'], new Map())).toBe(true);

    expect(middlewares.checkIp(ipv4, ['::'], new Map())).toBe(false);
    expect(middlewares.checkIp(ipv4, ['::/0'], new Map())).toBe(false);
    expect(middlewares.checkIp(ipv4, ['0.0.0.0'], new Map())).toBe(true);
    expect(middlewares.checkIp(ipv4, ['0.0.0.0/0'], new Map())).toBe(true);
    expect(middlewares.checkIp(ipv4, ['123.123.123.123'], new Map())).toBe(false);
    expect(middlewares.checkIp(ipv4, [ipv4], new Map())).toBe(true);
    expect(middlewares.checkIp(ipv4, ['192.168.0.0/24'], new Map())).toBe(true);

    expect(middlewares.checkIp(localhostV4, ['::1'], new Map())).toBe(false);
    expect(middlewares.checkIp(localhostV6, ['::1'], new Map())).toBe(true);
    // ::ffff:127.0.0.1 is a padded ipv4 address but not ::1
    expect(middlewares.checkIp(localhostV62, ['::1'], new Map())).toBe(false);
    // ::ffff:127.0.0.1 is a padded ipv4 address and is a match for  127.0.0.1
    expect(middlewares.checkIp(localhostV62, ['127.0.0.1'], new Map())).toBe(true);
  });

  it('should match address with cache', () => {
    const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    const cache1 = new Map();
    const spyBlockListCheck = spyOn(BlockList.prototype, 'check').and.callThrough();
    expect(middlewares.checkIp(ipv6, ['::'], cache1)).toBe(true);
    expect(cache1.get('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(undefined);
    expect(cache1.get('allowAllIpv6')).toBe(true);
    expect(spyBlockListCheck).toHaveBeenCalledTimes(0);

    const cache2 = new Map();
    expect(middlewares.checkIp('::1', ['::1'], cache2)).toBe(true);
    expect(cache2.get('::1')).toBe(true);
    expect(spyBlockListCheck).toHaveBeenCalledTimes(1);
    expect(middlewares.checkIp('::1', ['::1'], cache2)).toBe(true);
    expect(spyBlockListCheck).toHaveBeenCalledTimes(1);
    spyBlockListCheck.calls.reset();

    const cache3 = new Map();
    expect(middlewares.checkIp('127.0.0.1', ['127.0.0.1'], cache3)).toBe(true);
    expect(cache3.get('127.0.0.1')).toBe(true);
    expect(spyBlockListCheck).toHaveBeenCalledTimes(1);
    expect(middlewares.checkIp('127.0.0.1', ['127.0.0.1'], cache3)).toBe(true);
    expect(spyBlockListCheck).toHaveBeenCalledTimes(1);
    spyBlockListCheck.calls.reset();

    const cache4 = new Map();
    const ranges = ['127.0.0.1', '192.168.0.0/24'];
    // should not cache negative match
    expect(middlewares.checkIp('123.123.123.123', ranges, cache4)).toBe(false);
    expect(cache4.get('123.123.123.123')).toBe(undefined);
    expect(spyBlockListCheck).toHaveBeenCalledTimes(1);
    spyBlockListCheck.calls.reset();

    // should not cache cidr
    expect(middlewares.checkIp('192.168.0.101', ranges, cache4)).toBe(true);
    expect(cache4.get('192.168.0.101')).toBe(undefined);
    expect(spyBlockListCheck).toHaveBeenCalledTimes(1);
  });
});
