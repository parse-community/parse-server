const auth = require('../lib/Auth');
const Config = require('../lib/Config');
const rest = require('../lib/rest');
const request = require('../lib/request');
const AudiencesRouter = require('../lib/Routers/AudiencesRouter').AudiencesRouter;

describe('AudiencesRouter', () => {
  it('uses find condition from request.body', done => {
    const config = Config.get('test');
    const androidAudienceRequest = {
      name: 'Android Users',
      query: '{ "test": "android" }',
    };
    const iosAudienceRequest = {
      name: 'Iphone Users',
      query: '{ "test": "ios" }',
    };
    const request = {
      config: config,
      auth: auth.master(config),
      body: {
        where: {
          query: '{ "test": "android" }',
        },
      },
      query: {},
      info: {},
    };

    const router = new AudiencesRouter();
    rest
      .create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest);
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
    const androidAudienceRequest = {
      name: 'Android Users',
      query: '{ "test": "android" }',
    };
    const iosAudienceRequest = {
      name: 'Iphone Users',
      query: '{ "test": "ios" }',
    };
    const request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        where: {
          query: '{ "test": "android" }',
        },
      },
      info: {},
    };

    const router = new AudiencesRouter();
    rest
      .create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest);
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
        fail(err);
        done();
      });
  });

  it('query installations with limit = 0', done => {
    const config = Config.get('test');
    const androidAudienceRequest = {
      name: 'Android Users',
      query: '{ "test": "android" }',
    };
    const iosAudienceRequest = {
      name: 'Iphone Users',
      query: '{ "test": "ios" }',
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
    const router = new AudiencesRouter();
    rest
      .create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest);
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
    const androidAudienceRequest = {
      name: 'Android Users',
      query: '{ "test": "android" }',
    };
    const iosAudienceRequest = {
      name: 'Iphone Users',
      query: '{ "test": "ios" }',
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

    const router = new AudiencesRouter();
    rest
      .create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
      .then(() => rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest))
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

  it_exclude_dbs(['postgres'])('query installations with limit = 0 and count = 1', done => {
    const config = Config.get('test');
    const androidAudienceRequest = {
      name: 'Android Users',
      query: '{ "test": "android" }',
    };
    const iosAudienceRequest = {
      name: 'Iphone Users',
      query: '{ "test": "ios" }',
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

    const router = new AudiencesRouter();
    rest
      .create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
      .then(() => {
        return rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest);
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

  it('should create, read, update and delete audiences throw api', done => {
    Parse._request(
      'POST',
      'push_audiences',
      { name: 'My Audience', query: JSON.stringify({ deviceType: 'ios' }) },
      { useMasterKey: true }
    ).then(() => {
      Parse._request('GET', 'push_audiences', {}, { useMasterKey: true }).then(results => {
        expect(results.results.length).toEqual(1);
        expect(results.results[0].name).toEqual('My Audience');
        expect(results.results[0].query.deviceType).toEqual('ios');
        Parse._request(
          'GET',
          `push_audiences/${results.results[0].objectId}`,
          {},
          { useMasterKey: true }
        ).then(results => {
          expect(results.name).toEqual('My Audience');
          expect(results.query.deviceType).toEqual('ios');
          Parse._request(
            'PUT',
            `push_audiences/${results.objectId}`,
            { name: 'My Audience 2' },
            { useMasterKey: true }
          ).then(() => {
            Parse._request(
              'GET',
              `push_audiences/${results.objectId}`,
              {},
              { useMasterKey: true }
            ).then(results => {
              expect(results.name).toEqual('My Audience 2');
              expect(results.query.deviceType).toEqual('ios');
              Parse._request(
                'DELETE',
                `push_audiences/${results.objectId}`,
                {},
                { useMasterKey: true }
              ).then(() => {
                Parse._request('GET', 'push_audiences', {}, { useMasterKey: true }).then(
                  results => {
                    expect(results.results.length).toEqual(0);
                    done();
                  }
                );
              });
            });
          });
        });
      });
    });
  });

  it('should only create with master key', done => {
    Parse._request('POST', 'push_audiences', {
      name: 'My Audience',
      query: JSON.stringify({ deviceType: 'ios' }),
    }).then(
      () => {},
      error => {
        expect(error.message).toEqual('unauthorized: master key is required');
        done();
      }
    );
  });

  it('should only find with master key', done => {
    Parse._request('GET', 'push_audiences', {}).then(
      () => {},
      error => {
        expect(error.message).toEqual('unauthorized: master key is required');
        done();
      }
    );
  });

  it('should only get with master key', done => {
    Parse._request('GET', `push_audiences/someId`, {}).then(
      () => {},
      error => {
        expect(error.message).toEqual('unauthorized: master key is required');
        done();
      }
    );
  });

  it('should only update with master key', done => {
    Parse._request('PUT', `push_audiences/someId`, {
      name: 'My Audience 2',
    }).then(
      () => {},
      error => {
        expect(error.message).toEqual('unauthorized: master key is required');
        done();
      }
    );
  });

  it('should only delete with master key', done => {
    Parse._request('DELETE', `push_audiences/someId`, {}).then(
      () => {},
      error => {
        expect(error.message).toEqual('unauthorized: master key is required');
        done();
      }
    );
  });

  it_exclude_dbs(['postgres'])('should support legacy parse.com audience fields', done => {
    const database = Config.get(Parse.applicationId).database.adapter.database;
    const now = new Date();
    Parse._request(
      'POST',
      'push_audiences',
      { name: 'My Audience', query: JSON.stringify({ deviceType: 'ios' }) },
      { useMasterKey: true }
    ).then(audience => {
      database.collection('test__Audience').updateOne(
        { _id: audience.objectId },
        {
          $set: {
            times_used: 1,
            _last_used: now,
          },
        },
        {},
        error => {
          expect(error).toEqual(null);
          database
            .collection('test__Audience')
            .find({ _id: audience.objectId })
            .toArray((error, rows) => {
              expect(error).toEqual(null);
              expect(rows[0]['times_used']).toEqual(1);
              expect(rows[0]['_last_used']).toEqual(now);
              Parse._request(
                'GET',
                'push_audiences/' + audience.objectId,
                {},
                { useMasterKey: true }
              )
                .then(audience => {
                  expect(audience.name).toEqual('My Audience');
                  expect(audience.query.deviceType).toEqual('ios');
                  expect(audience.timesUsed).toEqual(1);
                  expect(audience.lastUsed).toEqual(now.toISOString());
                  done();
                })
                .catch(error => {
                  done.fail(error);
                });
            });
        }
      );
    });
  });

  it('should be able to search on audiences', done => {
    Parse._request(
      'POST',
      'push_audiences',
      { name: 'neverUsed', query: JSON.stringify({ deviceType: 'ios' }) },
      { useMasterKey: true }
    ).then(() => {
      const query = {
        timesUsed: { $exists: false },
        lastUsed: { $exists: false },
      };
      Parse._request(
        'GET',
        'push_audiences?order=-createdAt&limit=1',
        { where: query },
        { useMasterKey: true }
      )
        .then(results => {
          expect(results.results.length).toEqual(1);
          const audience = results.results[0];
          expect(audience.name).toEqual('neverUsed');
          done();
        })
        .catch(error => {
          done.fail(error);
        });
    });
  });

  it('should handle _Audience invalid fields via rest', async () => {
    await reconfigureServer({
      appId: 'test',
      restAPIKey: 'test',
      publicServerURL: 'http://localhost:8378/1',
    });
    try {
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/classes/_Audience',
        body: { lorem: 'ipsum', _method: 'POST' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test',
          'Content-Type': 'application/json',
        },
      });
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.data.code).toBe(107);
      expect(e.data.error).toBe('Could not add field lorem');
    }
  });
});
