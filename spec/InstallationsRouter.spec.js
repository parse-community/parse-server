var auth = require('../src/Auth');
var Config = require('../src/Config');
var rest = require('../src/rest');
var InstallationsRouter = require('../src/Routers/InstallationsRouter').InstallationsRouter;

describe('InstallationsRouter', () => {
  it('uses find condition from request.body', (done) => {
    var config = Config.get('test');
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
      },
      query: {},
      info: {}
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
      }).catch((err) => {
        fail(JSON.stringify(err));
        done();
      });
  });

  it('uses find condition from request.query', (done) => {
    var config = Config.get('test');
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
      },
      info: {}
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
      }).catch((err) => {
        jfail(err);
        done();
      });
  });

  it('query installations with limit = 0', (done) => {
    var config = Config.get('test');
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
        limit: 0
      },
      info: {}
    };

    Config.get('test');
    var router = new InstallationsRouter();
    rest.create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
      }).then(() => {
        return router.handleFind(request);
      }).then((res) => {
        var response = res.response;
        expect(response.results.length).toEqual(0);
        done();
      }).catch((err) => {
        fail(JSON.stringify(err));
        done();
      });
  });

  it('query installations with count = 1', done => {
    var config = Config.get('test');
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
        count: 1
      },
      info: {}
    };

    var router = new InstallationsRouter();
    rest.create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
      .then(() => rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest))
      .then(() => router.handleFind(request))
      .then((res) => {
        var response = res.response;
        expect(response.results.length).toEqual(2);
        expect(response.count).toEqual(2);
        done();
      })
      .catch(error => {
        fail(JSON.stringify(error));
        done();
      })
  });

  it('query installations with limit = 0 and count = 1', (done) => {
    var config = Config.get('test');
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
        limit: 0,
        count: 1
      },
      info: {}
    };

    var router = new InstallationsRouter();
    rest.create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
      }).then(() => {
        return router.handleFind(request);
      }).then((res) => {
        var response = res.response;
        expect(response.results.length).toEqual(0);
        expect(response.count).toEqual(2);
        done();
      }).catch((err) => {
        fail(JSON.stringify(err));
        done();
      });
  });
});
