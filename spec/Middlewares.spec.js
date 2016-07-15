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
});