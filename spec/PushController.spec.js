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

    var { date } = PushController.getPushTime(body);
    expect(date).toEqual(new Date(timeStr));
    done();
  });

  it('can get push time in number format', (done) => {
    // Make mock request
    var timeNumber = 1426802708;
    var body = {
      'push_time': timeNumber
    }

    var { date } = PushController.getPushTime(body);
    expect(date.valueOf()).toEqual(timeNumber * 1000);
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
    var config = Config.get(Parse.applicationId);
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

    var config = Config.get(Parse.applicationId);
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

    var config = Config.get(Parse.applicationId);
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
    const pushStatusAfterSave = {
      handler: function() {}
    };
    const spy = spyOn(pushStatusAfterSave, 'handler').and.callThrough();
    Parse.Cloud.afterSave('_PushStatus', pushStatusAfterSave.handler);
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

    var config = Config.get(Parse.applicationId);
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
      })
      .then(() => {
        function getPushStatus(callIndex) {
          return spy.calls.all()[callIndex].args[0].object;
        }
        expect(spy).toHaveBeenCalled();
        expect(spy.calls.count()).toBe(4);
        const allCalls = spy.calls.all();
        allCalls.forEach((call) => {
          expect(call.args.length).toBe(2);
          const object = call.args[0].object;
          expect(object instanceof Parse.Object).toBe(true);
        });
        expect(getPushStatus(0).get('status')).toBe('pending');
        expect(getPushStatus(1).get('status')).toBe('running');
        expect(getPushStatus(1).get('numSent')).toBe(0);
        expect(getPushStatus(2).get('status')).toBe('running');
        expect(getPushStatus(2).get('numSent')).toBe(10);
        expect(getPushStatus(2).get('numFailed')).toBe(5);
        // Those are updated from a nested . operation, this would
        // not render correctly before
        expect(getPushStatus(2).get('failedPerType')).toEqual({
          android: 5
        });
        expect(getPushStatus(2).get('sentPerType')).toEqual({
          ios: 10
        });
        expect(getPushStatus(3).get('status')).toBe('succeeded');
      })
      .then(done).catch(done.fail);
  });

  it('properly creates _PushStatus without serverURL', (done) => {
    const pushStatusAfterSave = {
      handler: function() {}
    };
    Parse.Cloud.afterSave('_PushStatus', pushStatusAfterSave.handler);
    const installation = new Parse.Object("_Installation");
    installation.set("installationId", "installation");
    installation.set("deviceToken","device_token")
    installation.set("badge", 0);
    installation.set("originalBadge", 0);
    installation.set("deviceType", "ios");

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

    var config = Config.get(Parse.applicationId);
    var auth = {
      isMaster: true
    }
    var pushController = new PushController();
    return installation.save().then(() => {
      return reconfigureServer({
        serverURL: 'http://localhost:8378/', // server with borked URL
        push: { adapter: pushAdapter }
      })
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
        Parse.serverURL = 'http://localhost:8378/1'; // GOOD url
        const query = new Parse.Query('_PushStatus');
        return query.find({useMasterKey: true});
      }).then((results) => {
        expect(results.length).toBe(1);
      })
      .then(done).catch(done.fail);
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
    var config = Config.get(Parse.applicationId);
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
    var config = Config.get(Parse.applicationId);
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

    var config = Config.get(Parse.applicationId);
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
    }).date).toEqual(new Date(1000 * 1000));
    expect(PushController.getPushTime({
      'push_time': '2017-01-01'
    }).date).toEqual(new Date('2017-01-01'));

    expect(() => {PushController.getPushTime({
      'push_time': 'gibberish-time'
    })}).toThrow();
    expect(() => {PushController.getPushTime({
      'push_time': Number.NaN
    })}).toThrow();

    expect(PushController.getPushTime({
      push_time: '2017-09-06T13:42:48.369Z'
    })).toEqual({
      date: new Date('2017-09-06T13:42:48.369Z'),
      isLocalTime: false,
    });
    expect(PushController.getPushTime({
      push_time: '2007-04-05T12:30-02:00',
    })).toEqual({
      date: new Date('2007-04-05T12:30-02:00'),
      isLocalTime: false,
    });
    expect(PushController.getPushTime({
      push_time: '2007-04-05T12:30',
    })).toEqual({
      date: new Date('2007-04-05T12:30'),
      isLocalTime: true,
    });
  });

  it('should not schedule push when not configured', (done) => {
    var config = Config.get(Parse.applicationId);
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
      }).then(() => new Promise(resolve => setTimeout(resolve, 300)));
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
      var config = Config.get(Parse.applicationId);
      return Parse.Object.saveAll(installations).then(() => {
        return pushController.sendPush(payload, {}, config, auth);
      }).then(() => new Promise(resolve => setTimeout(resolve, 300)));
    }).then(() => {
      const query = new Parse.Query('_PushStatus');
      return query.find({useMasterKey: true}).then((results) => {
        expect(results.length).toBe(1);
        const pushStatus = results[0];
        expect(pushStatus.get('status')).toBe('scheduled');
      });
    }).then(done).catch(done.err);
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
      var config = Config.get(Parse.applicationId);
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

  it('should not mark the _PushStatus as failed when audience has no deviceToken', (done) => {
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
      installation.set("badge", installations.length);
      installation.set("originalBadge", installations.length);
      installation.set("deviceType", "ios");
      installations.push(installation);
    }

    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      var config = Config.get(Parse.applicationId);
      return Parse.Object.saveAll(installations).then(() => {
        return pushController.sendPush(payload, {}, config, auth)
      }).then(() => new Promise(resolve => setTimeout(resolve, 100)));
    }).then(() => {
      const query = new Parse.Query('_PushStatus');
      return query.find({useMasterKey: true}).then((results) => {
        expect(results.length).toBe(1);
        const pushStatus = results[0];
        expect(pushStatus.get('numSent')).toBe(0);
        expect(pushStatus.get('status')).toBe('succeeded');
        done();
      });
    }).catch((err) => {
      console.error(err);
      fail('should not fail');
      done();
    });
  });

  it('should support localized payload data', (done) => {
    var payload = {data: {
      alert: 'Hello!',
      'alert-fr': 'Bonjour',
      'alert-es': 'Ola'
    }}

    var pushAdapter = {
      send: function(body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var config = Config.get(Parse.applicationId);
    var auth = {
      isMaster: true
    }

    const where = {
      'deviceType': 'ios'
    }
    spyOn(pushAdapter, 'send').and.callThrough();
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
      installations[0].set('localeIdentifier', 'fr-CA');
      installations[1].set('localeIdentifier', 'fr-FR');
      installations[2].set('localeIdentifier', 'en-US');
      return Parse.Object.saveAll(installations);
    }).then(() => {
      return pushController.sendPush(payload, where, config, auth)
    }).then(() => {
      // Wait so the push is completed.
      return new Promise((resolve) => { setTimeout(() => { resolve(); }, 1000); });
    }).then(() => {
      expect(pushAdapter.send.calls.count()).toBe(2);
      const firstCall = pushAdapter.send.calls.first();
      expect(firstCall.args[0].data).toEqual({
        alert: 'Hello!'
      });
      expect(firstCall.args[1].length).toBe(3); // 3 installations

      const lastCall = pushAdapter.send.calls.mostRecent();
      expect(lastCall.args[0].data).toEqual({
        alert: 'Bonjour'
      });
      expect(lastCall.args[1].length).toBe(2); // 2 installations
      // No installation is in es so only 1 call for fr, and another for default
      done();
    }).catch(done.fail);
  });

  it('should update audiences', (done) => {
    var pushAdapter = {
      send: function(body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function() {
        return ["ios"];
      }
    }

    var config = Config.get(Parse.applicationId);
    var auth = {
      isMaster: true
    }

    var audienceId = null;
    var now = new Date();
    var timesUsed = 0;

    const where = {
      'deviceType': 'ios'
    }
    spyOn(pushAdapter, 'send').and.callThrough();
    var pushController = new PushController();
    reconfigureServer({
      push: { adapter: pushAdapter }
    }).then(() => {
      var installations = [];
      while (installations.length != 5) {
        const installation = new Parse.Object("_Installation");
        installation.set("installationId", "installation_" + installations.length);
        installation.set("deviceToken","device_token_" + installations.length)
        installation.set("badge", installations.length);
        installation.set("originalBadge", installations.length);
        installation.set("deviceType", "ios");
        installations.push(installation);
      }
      return Parse.Object.saveAll(installations);
    }).then(() => {
      // Create an audience
      const query = new Parse.Query("_Audience");
      query.descending("createdAt");
      query.equalTo("query", JSON.stringify(where));
      const parseResults = (results) => {
        if (results.length > 0) {
          audienceId = results[0].id;
          timesUsed = results[0].get('timesUsed');
          if (!isFinite(timesUsed)) {
            timesUsed = 0;
          }
        }
      }
      const audience = new Parse.Object("_Audience");
      audience.set("name", "testAudience")
      audience.set("query", JSON.stringify(where));
      return Parse.Object.saveAll(audience).then(() => {
        return query.find({ useMasterKey: true }).then(parseResults);
      });
    }).then(() => {
      var body = {
        data: { alert: 'hello' },
        audience_id: audienceId
      }
      return pushController.sendPush(body, where, config, auth)
    }).then(() => {
      // Wait so the push is completed.
      return new Promise((resolve) => { setTimeout(() => { resolve(); }, 1000); });
    }).then(() => {
      expect(pushAdapter.send.calls.count()).toBe(1);
      const firstCall = pushAdapter.send.calls.first();
      expect(firstCall.args[0].data).toEqual({
        alert: 'hello'
      });
      expect(firstCall.args[1].length).toBe(5);
    }).then(() => {
      // Get the audience we used above.
      const query = new Parse.Query("_Audience");
      query.equalTo("objectId", audienceId);
      return query.find({ useMasterKey: true })
    }).then((results) => {
      const audience = results[0];
      expect(audience.get('query')).toBe(JSON.stringify(where));
      expect(audience.get('timesUsed')).toBe(timesUsed + 1);
      expect(audience.get('lastUsed')).not.toBeLessThan(now);
    }).then(() => {
      done();
    }).catch(done.fail);
  });

  describe('pushTimeHasTimezoneComponent', () => {
    it('should be accurate', () => {
      expect(PushController.pushTimeHasTimezoneComponent('2017-09-06T17:14:01.048Z'))
        .toBe(true, 'UTC time');
      expect(PushController.pushTimeHasTimezoneComponent('2007-04-05T12:30-02:00'))
        .toBe(true, 'Timezone offset');
      expect(PushController.pushTimeHasTimezoneComponent('2007-04-05T12:30:00.000Z-02:00'))
        .toBe(true, 'Seconds + Milliseconds + Timezone offset');

      expect(PushController.pushTimeHasTimezoneComponent('2017-09-06T17:14:01.048'))
        .toBe(false, 'No timezone');
      expect(PushController.pushTimeHasTimezoneComponent('2017-09-06'))
        .toBe(false, 'YY-MM-DD');
    });
  });

  describe('formatPushTime', () => {
    it('should format as ISO string', () => {
      expect(PushController.formatPushTime({
        date: new Date('2017-09-06T17:14:01.048Z'),
        isLocalTime: false,
      })).toBe('2017-09-06T17:14:01.048Z', 'UTC time');
      expect(PushController.formatPushTime({
        date: new Date('2007-04-05T12:30-02:00'),
        isLocalTime: false
      })).toBe('2007-04-05T14:30:00.000Z', 'Timezone offset');

      expect(PushController.formatPushTime({
        date: new Date('2017-09-06T17:14:01.048'),
        isLocalTime: true,
      })).toBe('2017-09-06T17:14:01.048', 'No timezone');
      expect(PushController.formatPushTime({
        date: new Date('2017-09-06'),
        isLocalTime: true
      })).toBe('2017-09-06T00:00:00.000', 'YY-MM-DD');
    });
  });

  describe('Scheduling pushes in local time', () => {
    it('should preserve the push time', (done) => {
      const auth = {isMaster: true};
      const pushAdapter = {
        send(body, installations) {
          return successfulTransmissions(body, installations);
        },
        getValidPushTypes() {
          return ["ios"];
        }
      };

      const pushTime = '2017-09-06T17:14:01.048';

      reconfigureServer({
        push: {adapter: pushAdapter},
        scheduledPush: true
      })
        .then(() => {
          const config = Config.get(Parse.applicationId);
          return new Promise((resolve, reject) => {
            const pushController = new PushController();
            pushController.sendPush({
              data: {
                alert: "Hello World!",
                badge: "Increment",
              },
              push_time: pushTime
            }, {}, config, auth, resolve)
              .catch(reject);
          })
        })
        .then((pushStatusId) => {
          const q = new Parse.Query('_PushStatus');
          return q.get(pushStatusId, {useMasterKey: true});
        })
        .then((pushStatus) => {
          expect(pushStatus.get('status')).toBe('scheduled');
          expect(pushStatus.get('pushTime')).toBe('2017-09-06T17:14:01.048');
        })
        .then(done, done.fail);
    });
  });

  describe('With expiration defined', () => {
    const auth = {isMaster: true};
    const pushController = new PushController();

    let config = Config.get(Parse.applicationId);

    const pushes = [];
    const pushAdapter = {
      send(body, installations) {
        pushes.push(body);
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes() {
        return ["ios"];
      }
    };

    beforeEach((done) => {
      reconfigureServer({
        push: {adapter: pushAdapter},
      })
        .then(() => {
          config = Config.get(Parse.applicationId);
        })
        .then(done, done.fail);
    });

    it('should throw if both expiration_time and expiration_interval are set', () => {
      expect(() => pushController.sendPush({
        expiration_time: '2017-09-25T13:21:20.841Z',
        expiration_interval: 1000,
      }, {}, config, auth)).toThrow()
    });

    it('should throw on invalid expiration_interval', () => {
      expect(() => pushController.sendPush({
        expiration_interval: -1
      }, {}, config, auth)).toThrow();
      expect(() => pushController.sendPush({
        expiration_interval: '',
      }, {}, config, auth)).toThrow();
      expect(() => pushController.sendPush({
        expiration_time: {},
      }, {}, config, auth)).toThrow();
    });

    describe('For immediate pushes',() => {
      it('should transform the expiration_interval into an absolute time', (done) => {
        const now = new Date('2017-09-25T13:30:10.452Z');

        reconfigureServer({
          push: {adapter: pushAdapter},
        })
          .then(() =>
            new Promise((resolve) => {
              pushController.sendPush({
                data: {
                  alert: 'immediate push',
                },
                expiration_interval: 20 * 60, // twenty minutes
              }, {}, Config.get(Parse.applicationId), auth, resolve, now)
            }))
          .then((pushStatusId) => {
            const p = new Parse.Object('_PushStatus');
            p.id = pushStatusId;
            return p.fetch({useMasterKey: true});
          })
          .then((pushStatus) => {
            expect(pushStatus.get('expiry')).toBeDefined('expiry must be set');
            expect(pushStatus.get('expiry'))
              .toEqual(new Date('2017-09-25T13:50:10.452Z').valueOf());

            expect(pushStatus.get('expiration_interval')).toBeDefined('expiration_interval must be defined');
            expect(pushStatus.get('expiration_interval')).toBe(20 * 60);
          })
          .then(done, done.fail);
      });
    });
  });
});
