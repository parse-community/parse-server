'use strict';

let request = require('request');

describe('Parse.Push', () => {

  var setup = function() {
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
        return Promise.all(promises);
      },
      getValidPushTypes: function() {
        return ["ios", "android"];
      }
    }

    return reconfigureServer({
      appId: Parse.applicationId,
      masterKey: Parse.masterKey,
      serverURL: Parse.serverURL,
      push: {
        adapter: pushAdapter
      }
    })
    .then(() => {
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
      return Parse.Object.saveAll(installations);
    });
  }

  it('should properly send push', (done) => {
    return setup().then(() => {
      return Parse.Push.send({
       where: {
         deviceType: 'ios'
       },
       data: {
         badge: 'Increment',
         alert: 'Hello world!'
       }
     }, {useMasterKey: true})
    })
    .then(() => {
      done();
    }, (err) => {
      console.error();
      fail('should not fail sending push')
      done();
    });
  });

  it('should properly send push with lowercaseIncrement', (done) => {
    return setup().then(() => {
      return Parse.Push.send({
       where: {
         deviceType: 'ios'
       },
       data: {
         badge: 'increment',
         alert: 'Hello world!'
       }
     }, {useMasterKey: true})
    }).then(() => {
      done();
    }, (err) => {
      console.error();
      fail('should not fail sending push')
      done();
    });
  });

  it('should not allow clients to query _PushStatus', done => {
    setup()
    .then(() => Parse.Push.send({
      where: {
        deviceType: 'ios'
      },
      data: {
        badge: 'increment',
        alert: 'Hello world!'
      }
    }, {useMasterKey: true}))
    .then(() => {
      request.get({
        url: 'http://localhost:8378/1/classes/_PushStatus',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
        },
      }, (error, response, body) => {
        expect(body.error).toEqual('unauthorized');
        done();
      });
    });
  });

  it('should allow master key to query _PushStatus', done => {
    setup()
    .then(() => Parse.Push.send({
      where: {
        deviceType: 'ios'
      },
      data: {
        badge: 'increment',
        alert: 'Hello world!'
      }
    }, {useMasterKey: true}))
    .then(() => {
      request.get({
        url: 'http://localhost:8378/1/classes/_PushStatus',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
      }, (error, response, body) => {
        expect(body.results.length).toEqual(1);
        expect(body.results[0].query).toEqual('{"deviceType":"ios"}');
        expect(body.results[0].payload).toEqual('{"badge":"increment","alert":"Hello world!"}');
        done();
      });
    });
  });
});
