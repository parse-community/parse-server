var PushController = require('../src/Controllers/PushController').PushController;

var cache = require('../src/cache');

describe('PushController', () => {
  it('can check valid master key of request', (done) => {
    // Make mock request
    var auth = {
      isMaster: true
    }

    expect(() => {
      PushController.validateMasterKey(auth);
    }).not.toThrow();
    done();
  });

  it('can check invalid master key of request', (done) => {
    // Make mock request
    var auth = {
      isMaster: false
    }

    expect(() => {
      PushController.validateMasterKey(auth);
    }).toThrow();
    done();
  });


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
    
   var payload = {
     alert: "Hello World!",
     badge: "Increment",
   }
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
      var badge = body.badge;
      installations.forEach((installation) => {
        if (installation.deviceType == "ios") {
          expect(installation.badge).toEqual(badge);
          expect(installation.originalBadge+1).toEqual(installation.badge);
        } else {
          expect(installation.badge).toBeUndefined();
        }
      })
      return Promise.resolve({
        body: body,
        installations: installations
      })
    },
    getValidPushTypes: function() {
      return ["ios", "android"];
    }
  }
  
   var config = cache.apps.get(Parse.applicationId);
   var auth = {
    isMaster: true
   }
   
   var pushController = new PushController(pushAdapter, Parse.applicationId);
   Parse.Object.saveAll(installations).then((installations) => {     
     return pushController.sendPush(payload, {}, config, auth);
   }).then((result) => {
     done();
   }, (err) => {
     console.error(err);
     fail("should not fail");
     done();
   });
   
  });
  
  it('properly set badges to 1', (done) => {
    
   var payload = {
     alert: "Hello World!",
     badge: 1,
   }
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
      var badge = body.badge;
      installations.forEach((installation) => {
        expect(installation.badge).toEqual(badge);
        expect(1).toEqual(installation.badge);
      })
      return Promise.resolve({
        body: body,
        installations: installations
      })
    },
    getValidPushTypes: function() {
      return ["ios"];
    }
  }
  
   var config = cache.apps.get(Parse.applicationId);
   var auth = {
    isMaster: true
   }
   
   var pushController = new PushController(pushAdapter, Parse.applicationId);
   Parse.Object.saveAll(installations).then((installations) => {     
     return pushController.sendPush(payload, {}, config, auth);
   }).then((result) => {
     done();
   }, (err) => {
     console.error(err);
     fail("should not fail");
     done();
   });
   
  })

});
