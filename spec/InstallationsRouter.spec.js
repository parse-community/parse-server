const auth = require('../lib/Auth');
const Config = require('../lib/Config');
const rest = require('../lib/rest');
const httpRequest = require('../lib/request');
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

  it_only_db('postgres')('query installations with count = 1 postgres', async () => {
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

  it('uses find condition from a where string in request.body', async () => {
    const config = Config.get('test');
    await rest.create(config, auth.nobody(config), '_Installation', {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
    });
    await rest.create(config, auth.nobody(config), '_Installation', {
      installationId: '12345678-abcd-abcd-abcd-123456789abd',
      deviceType: 'ios',
    });

    const router = new InstallationsRouter();
    const res = await router.handleFind({
      config: config,
      auth: auth.master(config),
      body: { where: JSON.stringify({ deviceType: 'android' }) },
      query: {},
      info: {},
    });

    expect(res.response.results.length).toEqual(1);
    expect(res.response.results[0].deviceType).toEqual('android');
  });

  it('rejects an invalid where string in request.body', async () => {
    const config = Config.get('test');
    const router = new InstallationsRouter();
    let error;
    try {
      await router.handleFind({
        config: config,
        auth: auth.master(config),
        body: { where: 'not json' },
        query: {},
        info: {},
      });
      fail('find should have been rejected');
      return;
    } catch (e) {
      error = e;
    }
    expect(error.code).toEqual(Parse.Error.INVALID_JSON);
    expect(error.message).toEqual('where parameter is not valid JSON');
  });

  it('finds installations when the client sends the find as POST with _method=GET', async () => {
    const config = Config.get('test');
    await rest.create(config, auth.nobody(config), '_Installation', {
      installationId: '12345678-abcd-abcd-abcd-123456789abc',
      deviceType: 'android',
    });
    await rest.create(config, auth.nobody(config), '_Installation', {
      installationId: '12345678-abcd-abcd-abcd-123456789abd',
      deviceType: 'ios',
    });

    // A client that exceeds the maximum URL length sends the find as a POST
    // with a urlencoded body, so `where` arrives as a string.
    const response = await httpRequest({
      method: 'POST',
      url: 'http://localhost:8378/1/installations',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `_method=GET&where=${encodeURIComponent(
        JSON.stringify({ installationId: { $in: ['12345678-abcd-abcd-abcd-123456789abc'] } })
      )}`,
    });

    expect(response.data.results.length).toEqual(1);
    expect(response.data.results[0].deviceType).toEqual('android');
  });
});
