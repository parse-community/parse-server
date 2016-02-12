var PushController = require('../src/Controllers/PushController').PushController;

describe('PushController', () => {
  it('can check valid master key of request', (done) => {
    // Make mock request
    var request = {
      info: {
        masterKey: 'masterKey'
      },
      config: {
        masterKey: 'masterKey'
      }
    }

    expect(() => {
      PushController.validateMasterKey(request);
    }).not.toThrow();
    done();
  });

  it('can check invalid master key of request', (done) => {
    // Make mock request
    var request = {
      info: {
        masterKey: 'masterKey'
      },
      config: {
        masterKey: 'masterKeyAgain'
      }
    }

    expect(() => {
      PushController.validateMasterKey(request);
    }).toThrow();
    done();
  });

  it('can get query condition when channels is set', (done) => {
    // Make mock request
    var request = {
      body: {
        channels: ['Giants', 'Mets']
      }
    }

    var where = PushController.getQueryCondition(request);
    expect(where).toEqual({
      'channels': {
        '$in': ['Giants', 'Mets']
      }
    });
    done();
  });

  it('can get query condition when where is set', (done) => {
    // Make mock request
    var request = {
      body: {
        'where': {
          'injuryReports': true
        }
      }
    }

    var where = PushController.getQueryCondition(request);
    expect(where).toEqual({
      'injuryReports': true
    });
    done();
  });

  it('can get query condition when nothing is set', (done) => {
    // Make mock request
    var request = {
      body: {
      }
    }

    expect(function() {
      PushController.getQueryCondition(request);
    }).toThrow();
    done();
  });

  it('can throw on getQueryCondition when channels and where are set', (done) => {
    // Make mock request
    var request = {
      body: {
        'channels': {
          '$in': ['Giants', 'Mets']
        },
        'where': {
          'injuryReports': true
        }
      }
    }

    expect(function() {
      PushController.getQueryCondition(request);
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
    var request = {
      body: {
        'expiration_time': timeStr
      }
    }

    var time = PushController.getExpirationTime(request);
    expect(time).toEqual(new Date(timeStr).valueOf());
    done();
  });

  it('can get expiration time in number format', (done) => {
    // Make mock request
    var timeNumber = 1426802708;
    var request = {
      body: {
        'expiration_time': timeNumber
      }
    }

    var time = PushController.getExpirationTime(request);
    expect(time).toEqual(timeNumber * 1000);
    done();
  });

  it('can throw on getExpirationTime in invalid format', (done) => {
    // Make mock request
    var request = {
      body: {
        'expiration_time': 'abcd'
      }
    }

    expect(function(){
      PushController.getExpirationTime(request);
    }).toThrow();
    done();
  });
});
