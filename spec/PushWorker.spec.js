var PushWorker = require('../src').PushWorker;
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
});
