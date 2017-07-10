"use strict";
var PushController = require('../src/Controllers/PushController').PushController;
var StatusHandler = require('../src/StatusHandler');
var Config = require('../src/Config');
var validatePushType = require('../src/Push/utils').validatePushType;

const successfulTransmissions = function(body, installations) {

  const promises = installations.map((device) => {
    return Promise.resolve({
      transmitted: true,
      device: device,
    })
  });

  return Promise.all(promises);
}

const successfulIOS = function(body, installations) {

  const promises = installations.map((device) => {
    return Promise.resolve({
      transmitted: device.deviceType == "ios",
      device: device,
    })
  });

  return Promise.all(promises);
}

describe('PushController', () => {
  it('can validate device type when no device type is set', (done) => {
    // Make query condition
    var where = {
    };
    var validPushTypes = ['ios', 'android'];

    expect(function(){
      validatePushType(where, validPushTypes);
    }).not.toThrow();
    done();
  });

  it('can validate device type when single valid device type is set', (done) => {
    // Make query condition
    var where = {
      'deviceType': 'ios'
    };
    var validPushTypes = ['ios', 'android'];

    expect(function(){
      validatePushType(where, validPushTypes);
    }).not.toThrow();
    done();
  });

  it('can validate device type when multiple valid device types are set', (done) => {
    // Make query condition
    var where = {
      'deviceType': {
        '$in': ['android', 'ios']
      }
    };
    var validPushTypes = ['ios', 'android'];

    expect(function(){
      validatePushType(where, validPushTypes);
    }).not.toThrow();
    done();
  });

  it('can throw on validateDeviceType when single invalid device type is set', (done) => {
    // Make query condition
    var where = {
      'deviceType': 'osx'
    };
    var validPushTypes = ['ios', 'android'];

    expect(function(){
      validatePushType(where, validPushTypes);
    }).toThrow();
    done();
  });

  it('can throw on validateDeviceType when single invalid device type is set', (done) => {
    // Make query condition
    var where = {
      'deviceType': 'osx'
    };
    var validPushTypes = ['ios', 'android'];

    expect(function(){
      validatePushType(where, validPushTypes);
    }).toThrow();
    done();
  });

  it('can get expiration time in string format', (done) => {
    // Make mock request
    var timeStr = '2015-03-19T22:05:08Z';
    var body = {
      'expiration_time': timeStr
    }

    var time = PushController.getExpirationTime(body);
    expect(time).toEqual(new Date(timeStr).valueOf());
    done();
  });

  it('can get expiration time in number format', (done) => {
    // Make mock request
    var timeNumber = 1426802708;
    var body = {
      'expiration_time': timeNumber
    }

    var time = PushController.getExpirationTime(body);
    expect(time).toEqual(timeNumber * 1000);
    done();
  });

  it('can throw on getExpirationTime in invalid format', (done) => {
    // Make mock request
    var body = {
      'expiration_time': 'abcd'
    }

    expect(function(){
      PushController.getExpirationTime(body);
    }).toThrow();
    done();
  });

  it('can get push time in string format', (done) => {
    // Make mock request
    var timeStr = '2015-03-19T22:05:08Z';
    var body = {
      'push_time': timeStr
    }

    var time = PushController.getPushTime(body);
    expect(time).toEqual(new Date(timeStr));
    done();
  });

  it('can get push time in number format', (done) => {
    // Make mock request
    var timeNumber = 1426802708;
    var body = {
      'push_time': timeNumber
    }

    var time = PushController.getPushTime(body).valueOf();
    expect(time).toEqual(timeNumber * 1000);
    done();
  });

  it('can throw on getPushTime in invalid format', (done) => {
    // Make mock request
    var body = {
      'push_time': 'abcd'
    }

    expect(function(){
      PushController.getPushTime(body);
    }).toThrow();
    done();
  });

  it('properly increment badges', (done) => {
    var pushAdapter = {
      send: function(body, installations) {
        var badge = body.data.badge;
        installations.forEach((installation) => {
          expect(installation.badge).toEqual(badge);
          expect(installation.originalBadge + 1).toEqual(installation.badge);
        })
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios", "android"];
      }
    }
    var payload = {data:{
      alert: "Hello World!",
      badge: "Increment",
    }}
    var installations = [];
    while(installations.length != 10) {
      const installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length)
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }

    while(installations.length != 15) {
      const installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length);
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "android");
      installations.push(installation);
    }
    var config = new Config(Parse.applicationId);
    var auth = {
      isMaster: true
    }

    var pushController = new PushController();
    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      return Parse.Object.saveAll(installations)
    }).then(() => {
      return pushController.sendPush(payload, {}, config, auth);
    }).then(() => {
      // Wait so the push is completed.
      return new Promise((resolve) => { setTimeout(() => { resolve(); }, 1000); });
    }).then(() => {
      // Check we actually sent 15 pushes.
      const query = new Parse.Query('_PushStatus');
      return query.find({ useMasterKey: true })
    }).then((results) => {
      expect(results.length).toBe(1);
      const pushStatus = results[0];
      expect(pushStatus.get('numSent')).toBe(15);
    }).then(() => {
      // Check that the installations were actually updated.
      const query = new Parse.Query('_Installation');
      return query.find({ useMasterKey: true })
    }).then((results) => {
      expect(results.length).toBe(15);
      for (var i = 0; i < 15; i++) {
        const installation = results[i];
        expect(installation.get('badge')).toBe(parseInt(installation.get('originalBadge')) + 1);
      }
      done()
    }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('properly set badges to 1', (done) => {

    var pushAdapter = {
      send: function(body, installations) {
        var badge = body.data.badge;
        installations.forEach((installation) => {
          expect(installation.badge).toEqual(badge);
          expect(1).toEqual(installation.badge);
        })
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var payload = {data: {
      alert: "Hello World!",
      badge: 1,
    }}
    var installations = [];
    while(installations.length != 10) {
      var installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length)
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }

    var config = new Config(Parse.applicationId);
    var auth = {
      isMaster: true
    }

    var pushController = new PushController();
    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      return Parse.Object.saveAll(installations)
    }).then(() => {
      return pushController.sendPush(payload, {}, config, auth);
    }).then(() => {
      // Wait so the push is completed.
      return new Promise((resolve) => { setTimeout(() => { resolve(); }, 1000); });
    }).then(() => {
      // Check we actually sent the pushes.
      const query = new Parse.Query('_PushStatus');
      return query.find({ useMasterKey: true })
    }).then((results) => {
      expect(results.length).toBe(1);
      const pushStatus = results[0];
      expect(pushStatus.get('numSent')).toBe(10);
    }).then(() => {
      // Check that the installations were actually updated.
      const query = new Parse.Query('_Installation');
      return query.find({ useMasterKey: true })
    }).then((results) => {
      expect(results.length).toBe(10);
      for (var i = 0; i < 10; i++) {
        const installation = results[i];
        expect(installation.get('badge')).toBe(1);
      }
      done()
    }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('properly set badges to 1 with complex query #2903 #3022', (done) => {

    var payload = {
      data: {
        alert: "Hello World!",
        badge: 1,
      }
    }
    var installations = [];
    while(installations.length != 10) {
      var installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length)
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }
    let matchedInstallationsCount = 0;
    var pushAdapter = {
      send: function(body, installations) {
        matchedInstallationsCount += installations.length;
        var badge = body.data.badge;
        installations.forEach((installation) => {
          expect(installation.badge).toEqual(badge);
          expect(1).toEqual(installation.badge);
        })
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var config = new Config(Parse.applicationId);
    var auth = {
      isMaster: true
    }
    var pushController = new PushController();
    reconfigureServer({
      push: {
        adapter: pushAdapter
      }
    }).then(() => {
      return Parse.Object.saveAll(installations)
    }).then((installations) => {
      const objectIds = installations.map(installation => {
        return installation.id;
      })
      const where = {
        objectId: {'$in': objectIds.slice(0, 5)}
      }
      return pushController.sendPush(payload, where, config, auth);
    }).then(() => {
      return new Promise((res) => {
        setTimeout(res, 300);
      });
    }).then(() => {
      expect(matchedInstallationsCount).toBe(5);
      const query = new Parse.Query(Parse.Installation);
      query.equalTo('badge', 1);
      return query.find({useMasterKey: true});
    }).then((installations) => {
      expect(installations.length).toBe(5);
      done();
    }).catch(() => {
      fail("should not fail");
      done();
    });
  });

  it('properly creates _PushStatus', (done) => {
    var installations = [];
    while(installations.length != 10) {
      const installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length)
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }

    while(installations.length != 15) {
      const installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length)
      installation.set("deviceType", "android");
      installations.push(installation);
    }
    var payload = {data: {
      alert: "Hello World!",
      badge: 1,
    }}

    var pushAdapter = {
      send: function(body, installations) {
        return successfulIOS(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var config = new Config(Parse.applicationId);
    var auth = {
      isMaster: true
    }
    var pushController = new PushController();
    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      return Parse.Object.saveAll(installations);
    })
      .then(() => {
        return pushController.sendPush(payload, {}, config, auth);
      }).then(() => {
        // it is enqueued so it can take time
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve();
          }, 1000);
        });
      }).then(() => {
        const query = new Parse.Query('_PushStatus');
        return query.find({useMasterKey: true});
      }).then((results) => {
        expect(results.length).toBe(1);
        const result = results[0];
        expect(result.createdAt instanceof Date).toBe(true);
        expect(result.updatedAt instanceof Date).toBe(true);
        expect(result.id.length).toBe(10);
        expect(result.get('source')).toEqual('rest');
        expect(result.get('query')).toEqual(JSON.stringify({}));
        expect(typeof result.get('payload')).toEqual("string");
        expect(JSON.parse(result.get('payload'))).toEqual(payload.data);
        expect(result.get('status')).toEqual('succeeded');
        expect(result.get('numSent')).toEqual(10);
        expect(result.get('sentPerType')).toEqual({
          'ios': 10 // 10 ios
        });
        expect(result.get('numFailed')).toEqual(5);
        expect(result.get('failedPerType')).toEqual({
          'android': 5 // android
        });
        // Try to get it without masterKey
        const query = new Parse.Query('_PushStatus');
        return query.find();
      }).catch((error) => {
        expect(error.code).toBe(119);
        done();
      });
  });

  it('should properly report failures in _PushStatus', (done) => {
    var pushAdapter = {
      send: function(body, installations) {
        return installations.map((installation) => {
          return Promise.resolve({
            deviceType: installation.deviceType
          })
        })
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }
    const where = { 'channels': {
      '$ins': ['Giants', 'Mets']
    }};
    var payload = {data: {
      alert: "Hello World!",
      badge: 1,
    }}
    var config = new Config(Parse.applicationId);
    var auth = {
      isMaster: true
    }
    var pushController = new PushController();
    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      return pushController.sendPush(payload, where, config, auth)
    }).then(() => {
      fail('should not succeed');
      done();
    }).catch(() => {
      const query = new Parse.Query('_PushStatus');
      query.find({useMasterKey: true}).then((results) => {
        expect(results.length).toBe(1);
        const pushStatus = results[0];
        expect(pushStatus.get('status')).toBe('failed');
        done();
      });
    });
  });

  it('should support full RESTQuery for increment', (done) => {
    var payload = {data: {
      alert: "Hello World!",
      badge: 'Increment',
    }}

    var pushAdapter = {
      send: function(body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }
    var config = new Config(Parse.applicationId);
    var auth = {
      isMaster: true
    }

    const where = {
      'deviceToken': {
        '$in': ['device_token_0', 'device_token_1', 'device_token_2']
      }
    }

    var pushController = new PushController();
    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      var installations = [];
      while (installations.length != 5) {
        const installation = new Parse.Object("_Installation");
        installation.set("installationId", "installation_" + installations.length);
        installation.set("deviceToken", "device_token_" + installations.length)
        installation.set("badge", installations.length);
        installation.set("originalBadge", installations.length);
        installation.set("deviceType", "ios");
        installations.push(installation);
      }
      return Parse.Object.saveAll(installations);
    }).then(() => {
      return pushController.sendPush(payload, where, config, auth);
    }).then(() => {
      // Wait so the push is completed.
      return new Promise((resolve) => { setTimeout(() => { resolve(); }, 1000); });
    }).then(() => {
      const query = new Parse.Query('_PushStatus');
      return query.find({ useMasterKey: true })
    }).then((results) => {
      expect(results.length).toBe(1);
      const pushStatus = results[0];
      expect(pushStatus.get('numSent')).toBe(3);
      done();
    }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('should support object type for alert', (done) => {
    var payload = {data: {
      alert: {
        'loc-key': 'hello_world',
      },
    }}

    var pushAdapter = {
      send: function(body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var config = new Config(Parse.applicationId);
    var auth = {
      isMaster: true
    }

    const where = {
      'deviceType': 'ios'
    }

    var pushController = new PushController();
    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      var installations = [];
      while (installations.length != 5) {
        const installation = new Parse.Object("_Installation");
        installation.set("installationId", "installation_" + installations.length);
        installation.set("deviceToken", "device_token_" + installations.length)
        installation.set("badge", installations.length);
        installation.set("originalBadge", installations.length);
        installation.set("deviceType", "ios");
        installations.push(installation);
      }
      return Parse.Object.saveAll(installations);
    }).then(() => {
      return pushController.sendPush(payload, where, config, auth)
    }).then(() => {
      // Wait so the push is completed.
      return new Promise((resolve) => { setTimeout(() => { resolve(); }, 1000); });
    }).then(() => {
      const query = new Parse.Query('_PushStatus');
      return query.find({ useMasterKey: true })
    }).then((results) => {
      expect(results.length).toBe(1);
      const pushStatus = results[0];
      expect(pushStatus.get('numSent')).toBe(5);
      done();
    }).catch(() => {
      fail('should not fail');
      done();
    });
  });

  it('should flatten', () => {
    var res = StatusHandler.flatten([1, [2], [[3, 4], 5], [[[6]]]])
    expect(res).toEqual([1,2,3,4,5,6]);
  });

  it('properly transforms push time', () => {
    expect(PushController.getPushTime()).toBe(undefined);
    expect(PushController.getPushTime({
      'push_time': 1000
    })).toEqual(new Date(1000 * 1000));
    expect(PushController.getPushTime({
      'push_time': '2017-01-01'
    })).toEqual(new Date('2017-01-01'));
    expect(() => {PushController.getPushTime({
      'push_time': 'gibberish-time'
    })}).toThrow();
    expect(() => {PushController.getPushTime({
      'push_time': Number.NaN
    })}).toThrow();
  });

  it('should not schedule push when not configured', (done) => {
    var config = new Config(Parse.applicationId);
    var auth = {
      isMaster: true
    }
    var pushAdapter = {
      send: function(body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var pushController = new PushController();
    const payload = {
      data: {
        alert: 'hello',
      },
      push_time: new Date().getTime()
    }

    var installations = [];
    while(installations.length != 10) {
      const installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length)
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }

    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      return Parse.Object.saveAll(installations).then(() => {
        return pushController.sendPush(payload, {}, config, auth);
      });
    }).then(() => {
      const query = new Parse.Query('_PushStatus');
      return query.find({useMasterKey: true}).then((results) => {
        expect(results.length).toBe(1);
        const pushStatus = results[0];
        expect(pushStatus.get('status')).not.toBe('scheduled');
        done();
      });
    }).catch((err) => {
      console.error(err);
      fail('should not fail');
      done();
    });
  });

  it('should schedule push when configured', (done) => {
    var auth = {
      isMaster: true
    }
    var pushAdapter = {
      send: function(body, installations) {
        const promises = installations.map((device) => {
          if (!device.deviceToken) {
            // Simulate error when device token is not set
            return Promise.reject();
          }
          return Promise.resolve({
            transmitted: true,
            device: device,
          })
        });

        return Promise.all(promises);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var pushController = new PushController();
    const payload = {
      data: {
        alert: 'hello',
      },
      push_time: new Date().getTime() / 1000
    }

    var installations = [];
    while(installations.length != 10) {
      const installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length)
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }

    reconfigureServer({
      push: { adapter: pushAdapter },
      scheduledPush: true
    }).then(() => {
      var config = new Config(Parse.applicationId);
      return Parse.Object.saveAll(installations).then(() => {
        return pushController.sendPush(payload, {}, config, auth);
      }).then(() => new Promise(resolve => setTimeout(resolve, 100)));
    }).then(() => {
      const query = new Parse.Query('_PushStatus');
      return query.find({useMasterKey: true}).then((results) => {
        expect(results.length).toBe(1);
        const pushStatus = results[0];
        expect(pushStatus.get('status')).toBe('scheduled');
        done();
      });
    }).catch((err) => {
      console.error(err);
      fail('should not fail');
      done();
    });
  });

  it('should not enqueue push when device token is not set', (done) => {
    var auth = {
      isMaster: true
    }
    var pushAdapter = {
      send: function(body, installations) {
        const promises = installations.map((device) => {
          if (!device.deviceToken) {
            // Simulate error when device token is not set
            return Promise.reject();
          }
          return Promise.resolve({
            transmitted: true,
            device: device,
          })
        });

        return Promise.all(promises);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var pushController = new PushController();
    const payload = {
      data: {
        alert: 'hello',
      },
      push_time: new Date().getTime() / 1000
    }

    var installations = [];
    while(installations.length != 5) {
      const installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("deviceToken","device_token_" + installations.length)
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }

    while(installations.length != 15) {
      const installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_" + installations.length);
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }

    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      var config = new Config(Parse.applicationId);
      return Parse.Object.saveAll(installations).then(() => {
        return pushController.sendPush(payload, {}, config, auth);
      }).then(() => new Promise(resolve => setTimeout(resolve, 100)));
    }).then(() => {
      const query = new Parse.Query('_PushStatus');
      return query.find({useMasterKey: true}).then((results) => {
        expect(results.length).toBe(1);
        const pushStatus = results[0];
        expect(pushStatus.get('numSent')).toBe(5);
        expect(pushStatus.get('status')).toBe('succeeded');
        done();
      });
    }).catch((err) => {
      console.error(err);
      fail('should not fail');
      done();
    });

  });
});
