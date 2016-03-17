'use strict';
describe('Parse.Push', () => {
  it('should properly send push', (done) => {
      var pushAdapter = {
        send: function(body, installations) {
          var badge = body.data.badge;
          let promises = installations.map((installation) => {
            if (installation.deviceType == "ios") {
              expect(installation.badge).toEqual(badge);
              expect(installation.originalBadge+1).toEqual(installation.badge);
            } else {
              expect(installation.badge).toBeUndefined();
            }
            return Promise.resolve({
              err: null,
              deviceType: installation.deviceType,
              result: true
            })
          });
          return Promise.all(promises)
        },
        getValidPushTypes: function() {
          return ["ios", "android"];
        }
      }
    setServerConfiguration({
      appId: Parse.applicationId,
      masterKey: Parse.masterKey,
      serverURL: Parse.serverURL,
      push: {
        adapter: pushAdapter
      }
    });
    var installations = [];
    while(installations.length != 10) {
      var installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_"+installations.length);
      installation.set("deviceToken","device_token_"+installations.length)
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }
    Parse.Object.saveAll(installations).then(() => {
      return Parse.Push.send({
        where: {
          deviceType: 'ios'
        },
        data: {
          badge: 'Increment',
          alert: 'Hello world!'
        }
      }, {useMasterKey: true});
    })
    .then(() => {
      done();
    }, (err) => {
      console.error(err);
      done();
    });
  });
});
