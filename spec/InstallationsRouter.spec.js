const auth = require('../lib/Auth');
const Config = require('../lib/Config');
const rest = require('../lib/rest');
const InstallationsRouter = require('../lib/Routers/InstallationsRouter').InstallationsRouter;

describe('InstallationsRouter', () => {
  it('uses find condition from request.body', done => {
    const config = Config.get('test');
    const androidDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
    };
    const iosDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abd',
      deviceType: 'ios',
    };
    const request = {
      config: config,
      auth: auth.master(config),
      body: {
        where: {
          deviceType: 'android',
        },
      },
      query: {},
      info: {},
    };

    const router = new InstallationsRouter();
    rest
      .create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
      })
      .then(() => {
        return router.handleFind(request);
      })
      .then(res => {
        const results = res.response.results;
        expect(results.length).toEqual(1);
        done();
      })
      .catch(err => {
        fail(JSON.stringify(err));
        done();
      });
  });

  it('uses find condition from request.query', done => {
    const config = Config.get('test');
    const androidDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
    };
    const iosDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abd',
      deviceType: 'ios',
    };
    const request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        where: {
          deviceType: 'android',
        },
      },
      info: {},
    };

    const router = new InstallationsRouter();
    rest
      .create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
      })
      .then(() => {
        return router.handleFind(request);
      })
      .then(res => {
        const results = res.response.results;
        expect(results.length).toEqual(1);
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('query installations with limit = 0', done => {
    const config = Config.get('test');
    const androidDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
    };
    const iosDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abd',
      deviceType: 'ios',
    };
    const request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        limit: 0,
      },
      info: {},
    };

    Config.get('test');
    const router = new InstallationsRouter();
    rest
      .create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
      })
      .then(() => {
        return router.handleFind(request);
      })
      .then(res => {
        const response = res.response;
        expect(response.results.length).toEqual(0);
        done();
      })
      .catch(err => {
        fail(JSON.stringify(err));
        done();
      });
  });

  it_exclude_dbs(['postgres'])('query installations with count = 1', done => {
    const config = Config.get('test');
    const androidDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
    };
    const iosDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abd',
      deviceType: 'ios',
    };
    const request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        count: 1,
      },
      info: {},
    };

    const router = new InstallationsRouter();
    rest
      .create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
      .then(() => rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest))
      .then(() => router.handleFind(request))
      .then(res => {
        const response = res.response;
        expect(response.results.length).toEqual(2);
        expect(response.count).toEqual(2);
        done();
      })
      .catch(error => {
        fail(JSON.stringify(error));
        done();
      });
  });

  it_only_db('postgres')('query installations with count = 1', async () => {
    const config = Config.get('test');
    const androidDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
    };
    const iosDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abd',
      deviceType: 'ios',
    };
    const request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        count: 1,
      },
      info: {},
    };

    const router = new InstallationsRouter();
    await rest.create(config, auth.nobody(config), '_Installation', androidDeviceRequest);
    await rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
    let res = await router.handleFind(request);
    let response = res.response;
    expect(response.results.length).toEqual(2);
    expect(response.count).toEqual(0); // estimate count is zero

    const pgAdapter = config.database.adapter;
    await pgAdapter.updateEstimatedCount('_Installation');

    res = await router.handleFind(request);
    response = res.response;
    expect(response.results.length).toEqual(2);
    expect(response.count).toEqual(2);
  });

  it_exclude_dbs(['postgres'])('query installations with limit = 0 and count = 1', done => {
    const config = Config.get('test');
    const androidDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
    };
    const iosDeviceRequest = {
      installationId: '12345678-abcd-abcd-abcd-123456789abd',
      deviceType: 'ios',
    };
    const request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        limit: 0,
        count: 1,
      },
      info: {},
    };

    const router = new InstallationsRouter();
    rest
      .create(config, auth.nobody(config), '_Installation', androidDeviceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Installation', iosDeviceRequest);
      })
      .then(() => {
        return router.handleFind(request);
      })
      .then(res => {
        const response = res.response;
        expect(response.results.length).toEqual(0);
        expect(response.count).toEqual(2);
        done();
      })
      .catch(err => {
        fail(JSON.stringify(err));
        done();
      });
  });
});
