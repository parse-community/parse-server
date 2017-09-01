var PushWorker = require('../src').PushWorker;
var PushUtils = require('../src/Push/utils');
var Config = require('../src/Config');

describe('PushWorker', () => {
  it('should run with small batch', (done) => {
    const batchSize = 3;
    var sendCount = 0;
    reconfigureServer({
      push: {
        queueOptions: {
          disablePushWorker: true,
          batchSize
        }
      }
    }).then(() => {
      expect(new Config('test').pushWorker).toBeUndefined();
      new PushWorker({
        send: (body, installations) => {
          expect(installations.length <= batchSize).toBe(true);
          sendCount += installations.length;
          return Promise.resolve();
        },
        getValidPushTypes: function() {
          return ['ios', 'android']
        }
      });
      var installations = [];
      while(installations.length != 10) {
        var installation = new Parse.Object("_Installation");
        installation.set("installationId", "installation_" + installations.length);
        installation.set("deviceToken","device_token_" + installations.length)
        installation.set("badge", 1);
        installation.set("deviceType", "ios");
        installations.push(installation);
      }
      return Parse.Object.saveAll(installations);
    }).then(() => {
      return Parse.Push.send({
        where: {
          deviceType: 'ios'
        },
        data: {
          alert: 'Hello world!'
        }
      }, {useMasterKey: true})
    }).then(() => {
      return new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    }).then(() => {
      expect(sendCount).toBe(10);
      done();
    }).catch(err => {
      jfail(err);
    })
  });

  describe('localized push', () => {
    it('should return locales', () => {
      const locales = PushUtils.getLocalesFromPush({
        data: {
          'alert-fr': 'french',
          'alert': 'Yo!',
          'alert-en-US': 'English',
        }
      });
      expect(locales).toEqual(['fr', 'en-US']);
    });

    it('should return and empty array if no locale is set', () => {
      const locales = PushUtils.getLocalesFromPush({
        data: {
          'alert': 'Yo!',
        }
      });
      expect(locales).toEqual([]);
    });

    it('should deduplicate locales', () => {
      const locales = PushUtils.getLocalesFromPush({
        data: {
          'alert': 'Yo!',
          'alert-fr': 'french',
          'title-fr': 'french'
        }
      });
      expect(locales).toEqual(['fr']);
    });

    it('transforms body appropriately', () => {
      const cleanBody = PushUtils.transformPushBodyForLocale({
        data: {
          alert: 'Yo!',
          'alert-fr': 'frenchy!',
          'alert-en': 'english',
        }
      }, 'fr');
      expect(cleanBody).toEqual({
        data: {
          alert: 'frenchy!'
        }
      });
    });

    it('transforms body appropriately', () => {
      const cleanBody = PushUtils.transformPushBodyForLocale({
        data: {
          alert: 'Yo!',
          'alert-fr': 'frenchy!',
          'alert-en': 'english',
          'title-fr': 'french title'
        }
      }, 'fr');
      expect(cleanBody).toEqual({
        data: {
          alert: 'frenchy!',
          title: 'french title'
        }
      });
    });

    it('maps body on all provided locales', () => {
      const bodies = PushUtils.bodiesPerLocales({
        data: {
          alert: 'Yo!',
          'alert-fr': 'frenchy!',
          'alert-en': 'english',
          'title-fr': 'french title'
        }
      }, ['fr', 'en']);
      expect(bodies).toEqual({
        fr: {
          data: {
            alert: 'frenchy!',
            title: 'french title'
          }
        },
        en: {
          data: {
            alert: 'english',
          }
        },
        default: {
          data: {
            alert: 'Yo!'
          }
        }
      });
    });

    it('should properly handle defaut cases', () => {
      expect(PushUtils.transformPushBodyForLocale({})).toEqual({});
      expect(PushUtils.stripLocalesFromBody({})).toEqual({});
      expect(PushUtils.bodiesPerLocales({where: {}})).toEqual({default: {where: {}}});
      expect(PushUtils.groupByLocaleIdentifier([])).toEqual({default: []});
    });
  });
});
