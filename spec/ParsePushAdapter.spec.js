var ParsePushAdapter = require('../src/Adapters/Push/ParsePushAdapter');
var APNS = require('../src/APNS');
var GCM = require('../src/GCM').GCM;

describe('ParsePushAdapter', () => {
  it('can be initialized', (done) => {
    // Make mock config
    var pushConfig = {
      android: {
        senderId: 'senderId',
        apiKey: 'apiKey'
      },
      ios: [
        {
          cert: 'prodCert.pem',
          key: 'prodKey.pem',
          production: true,
          bundleId: 'bundleId'
        },
        {
          cert: 'devCert.pem',
          key: 'devKey.pem',
          production: false,
          bundleId: 'bundleIdAgain'
        }
      ]
    };

    var parsePushAdapter = new ParsePushAdapter(pushConfig);
    // Check ios
    var iosSender = parsePushAdapter.senderMap['ios'];
    expect(iosSender instanceof APNS).toBe(true);
    // Check android
    var androidSender = parsePushAdapter.senderMap['android'];
    expect(androidSender instanceof GCM).toBe(true);
    done();
  });

  it('can throw on initializing with unsupported push type', (done) => {
    // Make mock config
    var pushConfig = {
      win: {
        senderId: 'senderId',
        apiKey: 'apiKey'
      }
    };

    expect(function() {
      new ParsePushAdapter(pushConfig);
    }).toThrow();
    done();
  });

  it('can get valid push types', (done) => {
    var parsePushAdapter = new ParsePushAdapter();

    expect(parsePushAdapter.getValidPushTypes()).toEqual(['ios', 'android']);
    done();
  });

  it('can classify installation', (done) => {
    // Mock installations
    var validPushTypes = ['ios', 'android'];
    var installations = [
      {
        deviceType: 'android',
        deviceToken: 'androidToken'
      },
      {
        deviceType: 'ios',
        deviceToken: 'iosToken'
      },
      {
        deviceType: 'win',
        deviceToken: 'winToken'
      },
      {
        deviceType: 'android',
        deviceToken: undefined
      }
    ];

    var deviceMap = ParsePushAdapter.classifyInstallations(installations, validPushTypes);
    expect(deviceMap['android']).toEqual([makeDevice('androidToken')]);
    expect(deviceMap['ios']).toEqual([makeDevice('iosToken')]);
    expect(deviceMap['win']).toBe(undefined);
    done();
  });


  it('can send push notifications', (done) => {
    var parsePushAdapter = new ParsePushAdapter();
    // Mock android ios senders
    var androidSender = {
      send: jasmine.createSpy('send')
    };
    var iosSender = {
      send: jasmine.createSpy('send')
    };
    var senderMap = {
      ios: iosSender,
      android: androidSender
    };
    parsePushAdapter.senderMap = senderMap;
    // Mock installations
    var installations = [
      {
        deviceType: 'android',
        deviceToken: 'androidToken'
      },
      {
        deviceType: 'ios',
        deviceToken: 'iosToken'
      },
      {
        deviceType: 'win',
        deviceToken: 'winToken'
      },
      {
        deviceType: 'android',
        deviceToken: undefined
      }
    ];
    var data = {};

    parsePushAdapter.send(data, installations);
    // Check android sender
    expect(androidSender.send).toHaveBeenCalled();
    var args = androidSender.send.calls.first().args;
    expect(args[0]).toEqual(data);
    expect(args[1]).toEqual([
      makeDevice('androidToken')
    ]);
    // Check ios sender
    expect(iosSender.send).toHaveBeenCalled();
    args = iosSender.send.calls.first().args;
    expect(args[0]).toEqual(data);
    expect(args[1]).toEqual([
      makeDevice('iosToken')
    ]);
    done();
  });

  function makeDevice(deviceToken, appIdentifier) {
    return {
      deviceToken: deviceToken,
      appIdentifier: appIdentifier
    };
  }
});
