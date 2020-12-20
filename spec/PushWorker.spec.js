const PushWorker = require('../lib').PushWorker;
const PushUtils = require('../lib/Push/utils');
const Config = require('../lib/Config');
const { pushStatusHandler } = require('../lib/StatusHandler');
const rest = require('../lib/rest');

describe('PushWorker', () => {
  it('should run with small batch', done => {
    const batchSize = 3;
    let sendCount = 0;
    reconfigureServer({
      push: {
        queueOptions: {
          disablePushWorker: true,
          batchSize,
        },
      },
    })
      .then(() => {
        expect(Config.get('test').pushWorker).toBeUndefined();
        new PushWorker({
          send: (body, installations) => {
            expect(installations.length <= batchSize).toBe(true);
            sendCount += installations.length;
            return Promise.resolve();
          },
          getValidPushTypes: function () {
            return ['ios', 'android'];
          },
        });
        const installations = [];
        while (installations.length != 10) {
          const installation = new Parse.Object('_Installation');
          installation.set('installationId', 'installation_' + installations.length);
          installation.set('deviceToken', 'device_token_' + installations.length);
          installation.set('badge', 1);
          installation.set('deviceType', 'ios');
          installations.push(installation);
        }
        return Parse.Object.saveAll(installations);
      })
      .then(() => {
        return Parse.Push.send(
          {
            where: {
              deviceType: 'ios',
            },
            data: {
              alert: 'Hello world!',
            },
          },
          { useMasterKey: true }
        );
      })
      .then(() => {
        return new Promise(resolve => {
          setTimeout(resolve, 500);
        });
      })
      .then(() => {
        expect(sendCount).toBe(10);
        done();
      })
      .catch(err => {
        jfail(err);
      });
  });

  describe('localized push', () => {
    it('should return locales', () => {
      const locales = PushUtils.getLocalesFromPush({
        data: {
          'alert-fr': 'french',
          alert: 'Yo!',
          'alert-en-US': 'English',
        },
      });
      expect(locales).toEqual(['fr', 'en-US']);
    });

    it('should return and empty array if no locale is set', () => {
      const locales = PushUtils.getLocalesFromPush({
        data: {
          alert: 'Yo!',
        },
      });
      expect(locales).toEqual([]);
    });

    it('should deduplicate locales', () => {
      const locales = PushUtils.getLocalesFromPush({
        data: {
          alert: 'Yo!',
          'alert-fr': 'french',
          'title-fr': 'french',
        },
      });
      expect(locales).toEqual(['fr']);
    });

    it('should handle empty body data', () => {
      expect(PushUtils.getLocalesFromPush({})).toEqual([]);
    });

    it('transforms body appropriately', () => {
      const cleanBody = PushUtils.transformPushBodyForLocale(
        {
          data: {
            alert: 'Yo!',
            'alert-fr': 'frenchy!',
            'alert-en': 'english',
          },
        },
        'fr'
      );
      expect(cleanBody).toEqual({
        data: {
          alert: 'frenchy!',
        },
      });
    });

    it('transforms body appropriately', () => {
      const cleanBody = PushUtils.transformPushBodyForLocale(
        {
          data: {
            alert: 'Yo!',
            'alert-fr': 'frenchy!',
            'alert-en': 'english',
            'title-fr': 'french title',
          },
        },
        'fr'
      );
      expect(cleanBody).toEqual({
        data: {
          alert: 'frenchy!',
          title: 'french title',
        },
      });
    });

    it('maps body on all provided locales', () => {
      const bodies = PushUtils.bodiesPerLocales(
        {
          data: {
            alert: 'Yo!',
            'alert-fr': 'frenchy!',
            'alert-en': 'english',
            'title-fr': 'french title',
          },
        },
        ['fr', 'en']
      );
      expect(bodies).toEqual({
        fr: {
          data: {
            alert: 'frenchy!',
            title: 'french title',
          },
        },
        en: {
          data: {
            alert: 'english',
          },
        },
        default: {
          data: {
            alert: 'Yo!',
          },
        },
      });
    });

    it('should properly handle default cases', () => {
      expect(PushUtils.transformPushBodyForLocale({})).toEqual({});
      expect(PushUtils.stripLocalesFromBody({})).toEqual({});
      expect(PushUtils.bodiesPerLocales({ where: {} })).toEqual({
        default: { where: {} },
      });
      expect(PushUtils.groupByLocaleIdentifier([])).toEqual({ default: [] });
    });
  });

  describe('pushStatus', () => {
    it('should remove invalid installations', done => {
      const config = Config.get('test');
      const handler = pushStatusHandler(config);
      const spy = spyOn(config.database, 'update').and.callFake(() => {
        return Promise.resolve({});
      });
      const toAwait = handler.trackSent(
        [
          {
            transmitted: false,
            device: {
              deviceToken: 1,
              deviceType: 'ios',
            },
            response: { error: 'Unregistered' },
          },
          {
            transmitted: true,
            device: {
              deviceToken: 10,
              deviceType: 'ios',
            },
          },
          {
            transmitted: false,
            device: {
              deviceToken: 2,
              deviceType: 'ios',
            },
            response: { error: 'NotRegistered' },
          },
          {
            transmitted: false,
            device: {
              deviceToken: 3,
              deviceType: 'ios',
            },
            response: { error: 'InvalidRegistration' },
          },
          {
            transmitted: true,
            device: {
              deviceToken: 11,
              deviceType: 'ios',
            },
          },
          {
            transmitted: false,
            device: {
              deviceToken: 4,
              deviceType: 'ios',
            },
            response: { error: 'InvalidRegistration' },
          },
          {
            transmitted: false,
            device: {
              deviceToken: 5,
              deviceType: 'ios',
            },
            response: { error: 'InvalidRegistration' },
          },
          {
            // should not be deleted
            transmitted: false,
            device: {
              deviceToken: 101,
              deviceType: 'ios',
            },
            response: { error: 'invalid error...' },
          },
        ],
        undefined,
        true
      );
      expect(spy).toHaveBeenCalled();
      expect(spy.calls.count()).toBe(1);
      const lastCall = spy.calls.mostRecent();
      expect(lastCall.args[0]).toBe('_Installation');
      expect(lastCall.args[1]).toEqual({
        deviceToken: { $in: [1, 2, 3, 4, 5] },
      });
      expect(lastCall.args[2]).toEqual({
        deviceToken: { __op: 'Delete' },
      });
      toAwait.then(done).catch(done);
    });

    it('tracks push status per UTC offsets', done => {
      const config = Config.get('test');
      const handler = pushStatusHandler(config);
      const spy = spyOn(rest, 'update').and.callThrough();
      const UTCOffset = 1;
      handler
        .setInitial()
        .then(() => {
          return handler.trackSent(
            [
              {
                transmitted: false,
                device: {
                  deviceToken: 1,
                  deviceType: 'ios',
                },
              },
              {
                transmitted: true,
                device: {
                  deviceToken: 1,
                  deviceType: 'ios',
                },
              },
            ],
            UTCOffset
          );
        })
        .then(() => {
          expect(spy).toHaveBeenCalled();
          const lastCall = spy.calls.mostRecent();
          expect(lastCall.args[2]).toBe(`_PushStatus`);
          expect(lastCall.args[4]).toEqual({
            numSent: { __op: 'Increment', amount: 1 },
            numFailed: { __op: 'Increment', amount: 1 },
            'sentPerType.ios': { __op: 'Increment', amount: 1 },
            'failedPerType.ios': { __op: 'Increment', amount: 1 },
            [`sentPerUTCOffset.${UTCOffset}`]: { __op: 'Increment', amount: 1 },
            [`failedPerUTCOffset.${UTCOffset}`]: {
              __op: 'Increment',
              amount: 1,
            },
            count: { __op: 'Increment', amount: -1 },
          });
          const query = new Parse.Query('_PushStatus');
          return query.get(handler.objectId, { useMasterKey: true });
        })
        .then(pushStatus => {
          const sentPerUTCOffset = pushStatus.get('sentPerUTCOffset');
          expect(sentPerUTCOffset['1']).toBe(1);
          const failedPerUTCOffset = pushStatus.get('failedPerUTCOffset');
          expect(failedPerUTCOffset['1']).toBe(1);
          return handler.trackSent(
            [
              {
                transmitted: false,
                device: {
                  deviceToken: 1,
                  deviceType: 'ios',
                },
              },
              {
                transmitted: true,
                device: {
                  deviceToken: 1,
                  deviceType: 'ios',
                },
              },
              {
                transmitted: true,
                device: {
                  deviceToken: 1,
                  deviceType: 'ios',
                },
              },
            ],
            UTCOffset
          );
        })
        .then(() => {
          const query = new Parse.Query('_PushStatus');
          return query.get(handler.objectId, { useMasterKey: true });
        })
        .then(pushStatus => {
          const sentPerUTCOffset = pushStatus.get('sentPerUTCOffset');
          expect(sentPerUTCOffset['1']).toBe(3);
          const failedPerUTCOffset = pushStatus.get('failedPerUTCOffset');
          expect(failedPerUTCOffset['1']).toBe(2);
        })
        .then(done)
        .catch(done.fail);
    });

    it('tracks push status per UTC offsets with negative offsets', done => {
      const config = Config.get('test');
      const handler = pushStatusHandler(config);
      const spy = spyOn(rest, 'update').and.callThrough();
      const UTCOffset = -6;
      handler
        .setInitial()
        .then(() => {
          return handler.trackSent(
            [
              {
                transmitted: false,
                device: {
                  deviceToken: 1,
                  deviceType: 'ios',
                },
                response: { error: 'Unregistered' },
              },
              {
                transmitted: true,
                device: {
                  deviceToken: 1,
                  deviceType: 'ios',
                },
                response: { error: 'Unregistered' },
              },
            ],
            UTCOffset
          );
        })
        .then(() => {
          expect(spy).toHaveBeenCalled();
          const lastCall = spy.calls.mostRecent();
          expect(lastCall.args[2]).toBe('_PushStatus');
          expect(lastCall.args[4]).toEqual({
            numSent: { __op: 'Increment', amount: 1 },
            numFailed: { __op: 'Increment', amount: 1 },
            'sentPerType.ios': { __op: 'Increment', amount: 1 },
            'failedPerType.ios': { __op: 'Increment', amount: 1 },
            [`sentPerUTCOffset.${UTCOffset}`]: { __op: 'Increment', amount: 1 },
            [`failedPerUTCOffset.${UTCOffset}`]: {
              __op: 'Increment',
              amount: 1,
            },
            count: { __op: 'Increment', amount: -1 },
          });
          done();
        });
    });
  });
});
