"use strict";
var PushController = require('../src/Controllers/PushController').PushController;
var StatusHandler = require('../src/StatusHandler');
var Config = require('../src/Config');

const successfulTransmissions = function(body, installations) {

  let promises = installations.map((device) => {
    return Promise.resolve({
      transmitted: true,
      device: device,
    })
  });

  return Promise.all(promises);
}

const successfulIOS = function(body, installations) {

  let promises = installations.map((device) => {
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
      PushController.validatePushType(where, validPushTypes);
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
      PushController.validatePushType(where, validPushTypes);
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
      PushController.validatePushType(where, validPushTypes);
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
      PushController.validatePushType(where, validPushTypes);
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
      PushController.validatePushType(where, validPushTypes);
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

  it('properly increment badges', (done) => {

   var payload = {data:{
     alert: "Hello World!",
     badge: "Increment",
   }}
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

   while(installations.length != 15) {
     var installation = new Parse.Object("_Installation");
     installation.set("installationId", "installation_"+installations.length);
     installation.set("deviceToken","device_token_"+installations.length)
     installation.set("deviceType", "android");
     installations.push(installation);
   }

   var pushAdapter = {
    send: function(body, installations) {
      var badge = body.data.badge;
      installations.forEach((installation) => {
        if (installation.deviceType == "ios") {
          expect(installation.badge).toEqual(badge);
          expect(installation.originalBadge+1).toEqual(installation.badge);
        } else {
          expect(installation.badge).toBeUndefined();
        }
      })
      return successfulTransmissions(body, installations);
    },
    getValidPushTypes: function() {
      return ["ios", "android"];
    }
  }

   var config = new Config(Parse.applicationId);
   var auth = {
    isMaster: true
   }

   var pushController = new PushController(pushAdapter, Parse.applicationId, defaultConfiguration.push);
   Parse.Object.saveAll(installations).then((installations) => {
     return pushController.sendPush(payload, {}, config, auth);
   }).then((result) => {
     done();
   }, (err) => {
     jfail(err);
     done();
   });

  });

  it('properly set badges to 1', (done) => {

   var payload = {data: {
     alert: "Hello World!",
     badge: 1,
   }}
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

   var config = new Config(Parse.applicationId);
   var auth = {
    isMaster: true
   }

   var pushController = new PushController(pushAdapter, Parse.applicationId, defaultConfiguration.push);
   Parse.Object.saveAll(installations).then((installations) => {
     return pushController.sendPush(payload, {}, config, auth);
   }).then((result) => {
     done();
   }, (err) => {
     fail("should not fail");
     done();
   });

  });

  it('properly creates _PushStatus', (done) => {

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

    while(installations.length != 15) {
      var installation = new Parse.Object("_Installation");
      installation.set("installationId", "installation_"+installations.length);
      installation.set("deviceToken","device_token_"+installations.length)
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

   var pushController = new PushController(pushAdapter, Parse.applicationId, defaultConfiguration.push);
   Parse.Object.saveAll(installations).then(() => {
     return pushController.sendPush(payload, {}, config, auth);
   }).then((result) => {
     return new Promise((resolve, reject) => {
       setTimeout(() => {
         resolve();
       }, 1000);
     });
   }).then(() => {
     let query = new Parse.Query('_PushStatus');
     return query.find({useMasterKey: true});
   }).then((results) => {
     expect(results.length).toBe(1);
     let result = results[0];
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
     let query = new Parse.Query('_PushStatus');
     return query.find();
   }).then((results) => {
     expect(results.length).toBe(0);
     done();
   });

  });

  it('should properly report failures in _PushStatus', (done) => {
    var pushAdapter = {
     send: function(body, installations) {
       return installations.map((installation) => {
         return Promise.resolve({
           deviceType: installation.deviceType
         })
       })
     },
     getValidPushTypes: function() {
       return ["ios"];
     }
   }
   let where = { 'channels': {
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
   var pushController = new PushController(pushAdapter, Parse.applicationId, defaultConfiguration.push);
   pushController.sendPush(payload, where, config, auth).then(() => {
     fail('should not succeed');
     done();
   }).catch(() => {
     let query = new Parse.Query('_PushStatus');
     query.find({useMasterKey: true}).then((results) => {
       expect(results.length).toBe(1);
       let pushStatus = results[0];
       expect(pushStatus.get('status')).toBe('failed');
       done();
     });
   })
  });

  it('should support full RESTQuery for increment', (done) => {
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

   let where = {
     'deviceToken': {
       '$inQuery': {
         'where': {
           'deviceType': 'ios'
         },
         className: '_Installation'
       }
     }
   }

   var pushController = new PushController(pushAdapter, Parse.applicationId, defaultConfiguration.push);
   pushController.sendPush(payload, where, config, auth).then((result) => {
      done();
    }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('should support object type for alert', (done) => {
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

   let where = {
     'deviceToken': {
       '$inQuery': {
         'where': {
           'deviceType': 'ios'
         },
         className: '_Installation'
       }
     }
   }

   var pushController = new PushController(pushAdapter, Parse.applicationId, defaultConfiguration.push);
   pushController.sendPush(payload, where, config, auth).then((result) => {
      done();
    }).catch((err) => {
      fail('should not fail');
      done();
    });
  });

  it('should flatten', () => {
    var res = StatusHandler.flatten([1, [2], [[3, 4], 5], [[[6]]]])
    expect(res).toEqual([1,2,3,4,5,6]);
  })
});
