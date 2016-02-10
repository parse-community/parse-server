var ParsePushAdapter = require('../src/Adapters/Push/ParsePushAdapter');

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
          production: true
        },
        {
          cert: 'devCert.pem',
          key: 'devKey.pem',
          production: false
        }
      ]
    };

    var parsePushAdapter = new ParsePushAdapter(pushConfig);
    // Check ios
    var iosSenders = parsePushAdapter.senders['ios'];
    expect(iosSenders.length).toBe(2);
    // TODO: Remove this checking onec we inject APNS
    var prodApnsOptions = iosSenders[0].sender.options;
    expect(prodApnsOptions.cert).toBe(pushConfig.ios[0].cert);
    expect(prodApnsOptions.key).toBe(pushConfig.ios[0].key);
    expect(prodApnsOptions.production).toBe(pushConfig.ios[0].production);
    var devApnsOptions = iosSenders[1].sender.options;
    expect(devApnsOptions.cert).toBe(pushConfig.ios[1].cert);
    expect(devApnsOptions.key).toBe(pushConfig.ios[1].key);
    expect(devApnsOptions.production).toBe(pushConfig.ios[1].production);
    // Check android
    var androidSenders = parsePushAdapter.senders['android'];
    expect(androidSenders.length).toBe(1);
    var androidSender = androidSenders[0];
    // TODO: Remove this checking onec we inject GCM
    expect(androidSender.sender.key).toBe(pushConfig.android.apiKey);
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

  it('can throw on initializing with invalid pushConfig', (done) => {
    // Make mock config
    var pushConfig = {
      android: 123
    };

    expect(function() {
      new ParsePushAdapter(pushConfig);
    }).toThrow();
    done();
  });

  it('can get push senders', (done) => {
    var parsePushAdapter = new ParsePushAdapter();
    // Mock push senders
    var androidSender = {};
    var iosSender = {};
    var iosSenderAgain = {};
    parsePushAdapter.senders = {
      android: [
        androidSender
      ],
      ios: [
        iosSender,
        iosSenderAgain
      ]
    };

    expect(parsePushAdapter.getPushSenders('android')).toEqual([androidSender]);
    expect(parsePushAdapter.getPushSenders('ios')).toEqual([iosSender, iosSenderAgain]);
    done();
  });

  it('can get empty push senders', (done) => {
    var parsePushAdapter = new ParsePushAdapter();

    expect(parsePushAdapter.getPushSenders('android')).toEqual([]);
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

    var deviceTokenMap = ParsePushAdapter.classifyInstallation(installations, validPushTypes);
    expect(deviceTokenMap['android']).toEqual([makeDevice('androidToken')]);
    expect(deviceTokenMap['ios']).toEqual([makeDevice('iosToken')]);
    expect(deviceTokenMap['win']).toBe(undefined);
    done();
  });

  it('can slice ios devices', (done) => {
    // Mock devices
    var devices = [makeDevice(1), makeDevice(2), makeDevice(3), makeDevice(4)];

    var chunkDevices = ParsePushAdapter.sliceDevices('ios', devices, 2);
    expect(chunkDevices).toEqual([devices]);
    done();
  });

  it('can slice android devices', (done) => {
    // Mock devices
    var devices = [makeDevice(1), makeDevice(2), makeDevice(3), makeDevice(4)];

    var chunkDevices = ParsePushAdapter.sliceDevices('android', devices, 3);
    expect(chunkDevices).toEqual([
      [makeDevice(1), makeDevice(2), makeDevice(3)],
      [makeDevice(4)]
    ]);
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
    var iosSenderAgain = {
      send: jasmine.createSpy('send')
    };
    var senders = {
      ios: [iosSender, iosSenderAgain],
      android: [androidSender]
    };
    parsePushAdapter.senders = senders;
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
    expect(iosSenderAgain.send).toHaveBeenCalled();
    args = iosSenderAgain.send.calls.first().args;
    expect(args[0]).toEqual(data);
    expect(args[1]).toEqual([
      makeDevice('iosToken')
    ]);
    done();
  });

  function makeDevice(deviceToken) {
    return {
      deviceToken: deviceToken
    };
  }
});
