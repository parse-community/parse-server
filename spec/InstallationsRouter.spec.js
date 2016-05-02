var auth = require('../src/Auth');
var Config = require('../src/Config');
var rest = require('../src/rest');
var InstallationsRouter = require('../src/Routers/InstallationsRouter').InstallationsRouter;

var config = new Config('test');

describe('InstallationsRouter', () => {
  it('uses find condition from request.body', (done) => {
    var androidDeviceRequest = {
      'installationId': '12345678-abcd-abcd-abcd-123456789abc',
      'deviceType': 'android'
    };
    var iosDeviceRequest = {
      'installationId': '12345678-abcd-abcd-abcd-123456789abd',
      'deviceType': 'ios'
    };
    var request = {
      config: config,
      auth: auth.master(config),
      body: {
        where: {
          deviceType: 'android'
        }
      }
    };

    var router = new InstallationsRouter();
    rest.create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
    .then(() => {
      return rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
    }).then(() => {
      return router.handleFind(request);
    }).then((res) => {
      var results = res.response.results;
      expect(results.length).toEqual(1);
      done();
    });
  });

  it('uses find condition from request.query', (done) => {
    var androidDeviceRequest = {
      'installationId': '12345678-abcd-abcd-abcd-123456789abc',
      'deviceType': 'android'
    };
    var iosDeviceRequest = {
      'installationId': '12345678-abcd-abcd-abcd-123456789abd',
      'deviceType': 'ios'
    };
    var request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        where: {
          deviceType: 'android'
        }
      }
    };

    var router = new InstallationsRouter();
    rest.create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
        .then(() => {
          return rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
        }).then(() => {
      return router.handleFind(request);
    }).then((res) => {
      var results = res.response.results;
      expect(results.length).toEqual(1);
      done();
    });
  });
});
