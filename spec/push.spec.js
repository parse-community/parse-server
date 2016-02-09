var push = require('../src/push');

describe('push', () => {
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
      push.validateMasterKey(request);
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
      push.validateMasterKey(request);
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

    var where = push.getQueryCondition(request);
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

    var where = push.getQueryCondition(request);
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
      push.getQueryCondition(request);
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
      push.getQueryCondition(request);
    }).toThrow();
    done();
  });

  it('can validate device type when no device type is set', (done) => {
    // Make query condition
    var where = {
    }

    expect(function(){
      push.validateDeviceType(where);
    }).not.toThrow();
    done();
  });

  it('can validate device type when single valid device type is set', (done) => {
    // Make query condition
    var where = {
      'deviceType': 'ios'
    }

    expect(function(){
      push.validateDeviceType(where);
    }).not.toThrow();
    done();
  });

  it('can validate device type when multiple valid device types are set', (done) => {
    // Make query condition
    var where = {
      'deviceType': {
        '$in': ['android', 'ios']
      }
    }

    expect(function(){
      push.validateDeviceType(where);
    }).not.toThrow();
    done();
  });

  it('can throw on validateDeviceType when single invalid device type is set', (done) => {
    // Make query condition
    var where = {
      'deviceType': 'osx'
    }

    expect(function(){
      push.validateDeviceType(where);
    }).toThrow();
    done();
  });

  it('can throw on validateDeviceType when single invalid device type is set', (done) => {
    // Make query condition
    var where = {
      'deviceType': 'osx'
    }

    expect(function(){
      push.validateDeviceType(where)
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

    var time = push.getExpirationTime(request);
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

    var time = push.getExpirationTime(request);
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
      push.getExpirationTime(request);
    }).toThrow();
    done();
  });
});
