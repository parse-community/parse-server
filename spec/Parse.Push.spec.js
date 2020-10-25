'use strict';

const request = require('../lib/request');

const delayPromise = delay => {
  return new Promise(resolve => {
    setTimeout(resolve, delay);
  });
};

describe('Parse.Push', () => {
  const setup = function () {
    const sendToInstallationSpy = jasmine.createSpy();

    const pushAdapter = {
      send: function (body, installations) {
        const badge = body.data.badge;
        const promises = installations.map(installation => {
          sendToInstallationSpy(installation);

          if (installation.deviceType == 'ios') {
            expect(installation.badge).toEqual(badge);
            expect(installation.originalBadge + 1).toEqual(installation.badge);
          } else {
            expect(installation.badge).toBeUndefined();
          }
          return Promise.resolve({
            err: null,
            device: installation,
            transmitted: true,
          });
        });
        return Promise.all(promises);
      },
      getValidPushTypes: function () {
        return ['ios', 'android'];
      },
    };

    return reconfigureServer({
      appId: Parse.applicationId,
      masterKey: Parse.masterKey,
      serverURL: Parse.serverURL,
      push: {
        adapter: pushAdapter,
      },
    })
      .then(() => {
        const installations = [];
        while (installations.length != 10) {
          const installation = new Parse.Object('_Installation');
          installation.set('installationId', 'installation_' + installations.length);
          installation.set('deviceToken', 'device_token_' + installations.length);
          installation.set('badge', installations.length);
          installation.set('originalBadge', installations.length);
          installation.set('deviceType', 'ios');
          installations.push(installation);
        }
        return Parse.Object.saveAll(installations);
      })
      .then(() => {
        return {
          sendToInstallationSpy,
        };
      })
      .catch(err => {
        console.error(err);

        throw err;
      });
  };

  it('should properly send push', done => {
    return setup()
      .then(({ sendToInstallationSpy }) => {
        return Parse.Push.send(
          {
            where: {
              deviceType: 'ios',
            },
            data: {
              badge: 'Increment',
              alert: 'Hello world!',
            },
          },
          { useMasterKey: true }
        )
          .then(() => {
            return delayPromise(500);
          })
          .then(() => {
            expect(sendToInstallationSpy.calls.count()).toEqual(10);
          });
      })
      .then(() => {
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('should properly send push with lowercaseIncrement', done => {
    return setup()
      .then(() => {
        return Parse.Push.send(
          {
            where: {
              deviceType: 'ios',
            },
            data: {
              badge: 'increment',
              alert: 'Hello world!',
            },
          },
          { useMasterKey: true }
        );
      })
      .then(() => {
        return delayPromise(500);
      })
      .then(() => {
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('should not allow clients to query _PushStatus', done => {
    setup()
      .then(() =>
        Parse.Push.send(
          {
            where: {
              deviceType: 'ios',
            },
            data: {
              badge: 'increment',
              alert: 'Hello world!',
            },
          },
          { useMasterKey: true }
        )
      )
      .then(() => delayPromise(500))
      .then(() => {
        request({
          url: 'http://localhost:8378/1/classes/_PushStatus',
          json: true,
          headers: {
            'X-Parse-Application-Id': 'test',
          },
        }).then(fail, response => {
          expect(response.data.error).toEqual('unauthorized');
          done();
        });
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('should allow master key to query _PushStatus', done => {
    setup()
      .then(() =>
        Parse.Push.send(
          {
            where: {
              deviceType: 'ios',
            },
            data: {
              badge: 'increment',
              alert: 'Hello world!',
            },
          },
          { useMasterKey: true }
        )
      )
      .then(() => delayPromise(500)) // put a delay as we keep writing
      .then(() => {
        request({
          url: 'http://localhost:8378/1/classes/_PushStatus',
          json: true,
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
        }).then(response => {
          const body = response.data;
          try {
            expect(body.results.length).toEqual(1);
            expect(body.results[0].query).toEqual('{"deviceType":"ios"}');
            expect(body.results[0].payload).toEqual('{"badge":"increment","alert":"Hello world!"}');
          } catch (e) {
            jfail(e);
          }
          done();
        });
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('should throw error if missing push configuration', done => {
    reconfigureServer({ push: null })
      .then(() => {
        return Parse.Push.send(
          {
            where: {
              deviceType: 'ios',
            },
            data: {
              badge: 'increment',
              alert: 'Hello world!',
            },
          },
          { useMasterKey: true }
        );
      })
      .then(
        () => {
          fail('should not succeed');
        },
        err => {
          expect(err.code).toEqual(Parse.Error.PUSH_MISCONFIGURED);
          done();
        }
      )
      .catch(err => {
        jfail(err);
        done();
      });
  });

  const successfulAny = function (body, installations) {
    const promises = installations.map(device => {
      return Promise.resolve({
        transmitted: true,
        device: device,
      });
    });

    return Promise.all(promises);
  };

  const provideInstallations = function (num) {
    if (!num) {
      num = 2;
    }

    const installations = [];
    while (installations.length !== num) {
      // add Android installations
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('deviceType', 'android');
      installations.push(installation);
    }

    return installations;
  };

  const losingAdapter = {
    send: function (body, installations) {
      // simulate having lost an installation before this was called
      // thus invalidating our 'count' in _PushStatus
      installations.pop();

      return successfulAny(body, installations);
    },
    getValidPushTypes: function () {
      return ['android'];
    },
  };

  /**
   * Verifies that _PushStatus cannot get stuck in a 'running' state
   * Simulates a simple push where 1 installation is removed between _PushStatus
   * count being set and the pushes being sent
   */
  it("does not get stuck with _PushStatus 'running' on 1 installation lost", done => {
    reconfigureServer({
      push: { adapter: losingAdapter },
    })
      .then(() => {
        return Parse.Object.saveAll(provideInstallations());
      })
      .then(() => {
        return Parse.Push.send(
          {
            data: { alert: 'We fixed our status!' },
            where: { deviceType: 'android' },
          },
          { useMasterKey: true }
        );
      })
      .then(() => {
        // it is enqueued so it can take time
        return new Promise(resolve => {
          setTimeout(() => {
            resolve();
          }, 1000);
        });
      })
      .then(() => {
        // query for push status
        const query = new Parse.Query('_PushStatus');
        return query.find({ useMasterKey: true });
      })
      .then(results => {
        // verify status is NOT broken
        expect(results.length).toBe(1);
        const result = results[0];
        expect(result.get('status')).toEqual('succeeded');
        expect(result.get('numSent')).toEqual(1);
        expect(result.get('count')).toEqual(undefined);
        done();
      });
  });

  /**
   * Verifies that _PushStatus cannot get stuck in a 'running' state
   * Simulates a simple push where 1 installation is added between _PushStatus
   * count being set and the pushes being sent
   */
  it("does not get stuck with _PushStatus 'running' on 1 installation added", done => {
    const installations = provideInstallations();

    // add 1 iOS installation which we will omit & add later on
    const iOSInstallation = new Parse.Object('_Installation');
    iOSInstallation.set('installationId', 'installation_' + installations.length);
    iOSInstallation.set('deviceToken', 'device_token_' + installations.length);
    iOSInstallation.set('deviceType', 'ios');
    installations.push(iOSInstallation);

    reconfigureServer({
      push: {
        adapter: {
          send: function (body, installations) {
            // simulate having added an installation before this was called
            // thus invalidating our 'count' in _PushStatus
            installations.push(iOSInstallation);

            return successfulAny(body, installations);
          },
          getValidPushTypes: function () {
            return ['android'];
          },
        },
      },
    })
      .then(() => {
        return Parse.Object.saveAll(installations);
      })
      .then(() => {
        return Parse.Push.send(
          {
            data: { alert: 'We fixed our status!' },
            where: { deviceType: { $ne: 'random' } },
          },
          { useMasterKey: true }
        );
      })
      .then(() => {
        // it is enqueued so it can take time
        return new Promise(resolve => {
          setTimeout(() => {
            resolve();
          }, 1000);
        });
      })
      .then(() => {
        // query for push status
        const query = new Parse.Query('_PushStatus');
        return query.find({ useMasterKey: true });
      })
      .then(results => {
        // verify status is NOT broken
        expect(results.length).toBe(1);
        const result = results[0];
        expect(result.get('status')).toEqual('succeeded');
        expect(result.get('numSent')).toEqual(3);
        expect(result.get('count')).toEqual(undefined);
        done();
      });
  });

  /**
   * Verifies that _PushStatus cannot get stuck in a 'running' state
   * Simulates an extended push, where some installations may be removed,
   * resulting in a non-zero count
   */
  it("does not get stuck with _PushStatus 'running' on many installations removed", done => {
    const devices = 1000;
    const installations = provideInstallations(devices);

    reconfigureServer({
      push: { adapter: losingAdapter },
    })
      .then(() => {
        return Parse.Object.saveAll(installations);
      })
      .then(() => {
        return Parse.Push.send(
          {
            data: { alert: 'We fixed our status!' },
            where: { deviceType: 'android' },
          },
          { useMasterKey: true }
        );
      })
      .then(() => {
        // it is enqueued so it can take time
        return new Promise(resolve => {
          setTimeout(() => {
            resolve();
          }, 1000);
        });
      })
      .then(() => {
        // query for push status
        const query = new Parse.Query('_PushStatus');
        return query.find({ useMasterKey: true });
      })
      .then(results => {
        // verify status is NOT broken
        expect(results.length).toBe(1);
        const result = results[0];
        expect(result.get('status')).toEqual('succeeded');
        // expect # less than # of batches used, assuming each batch is 100 pushes
        expect(result.get('numSent')).toEqual(devices - devices / 100);
        expect(result.get('count')).toEqual(undefined);
        done();
      });
  });

  /**
   * Verifies that _PushStatus cannot get stuck in a 'running' state
   * Simulates an extended push, where some installations may be added,
   * resulting in a non-zero count
   */
  it("does not get stuck with _PushStatus 'running' on many installations added", done => {
    const devices = 1000;
    const installations = provideInstallations(devices);

    // add 1 iOS installation which we will omit & add later on
    const iOSInstallations = [];

    while (iOSInstallations.length !== devices / 100) {
      const iOSInstallation = new Parse.Object('_Installation');
      iOSInstallation.set('installationId', 'installation_' + installations.length);
      iOSInstallation.set('deviceToken', 'device_token_' + installations.length);
      iOSInstallation.set('deviceType', 'ios');
      installations.push(iOSInstallation);
      iOSInstallations.push(iOSInstallation);
    }

    reconfigureServer({
      push: {
        adapter: {
          send: function (body, installations) {
            // simulate having added an installation before this was called
            // thus invalidating our 'count' in _PushStatus
            installations.push(iOSInstallations.pop());

            return successfulAny(body, installations);
          },
          getValidPushTypes: function () {
            return ['android'];
          },
        },
      },
    })
      .then(() => {
        return Parse.Object.saveAll(installations);
      })
      .then(() => {
        return Parse.Push.send(
          {
            data: { alert: 'We fixed our status!' },
            where: { deviceType: { $ne: 'random' } },
          },
          { useMasterKey: true }
        );
      })
      .then(() => {
        // it is enqueued so it can take time
        return new Promise(resolve => {
          setTimeout(() => {
            resolve();
          }, 1000);
        });
      })
      .then(() => {
        // query for push status
        const query = new Parse.Query('_PushStatus');
        return query.find({ useMasterKey: true });
      })
      .then(results => {
        // verify status is NOT broken
        expect(results.length).toBe(1);
        const result = results[0];
        expect(result.get('status')).toEqual('succeeded');
        // expect # less than # of batches used, assuming each batch is 100 pushes
        expect(result.get('numSent')).toEqual(devices + devices / 100);
        expect(result.get('count')).toEqual(undefined);
        done();
      });
  });
});
