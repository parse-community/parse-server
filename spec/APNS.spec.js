var APNS = require('../src/APNS');

describe('APNS', () => {

  it('can initialize with single cert', (done) => {
    var args = {
      cert: 'prodCert.pem',
      key: 'prodKey.pem',
      production: true,
      bundleId: 'bundleId'
    }
    var apns = new APNS(args);

    expect(apns.conns.length).toBe(1);
    var apnsConnection = apns.conns[0];
    expect(apnsConnection.index).toBe(0);
    expect(apnsConnection.bundleId).toBe(args.bundleId);
    // TODO: Remove this checking onec we inject APNS
    var prodApnsOptions = apnsConnection.options;
    expect(prodApnsOptions.cert).toBe(args.cert);
    expect(prodApnsOptions.key).toBe(args.key);
    expect(prodApnsOptions.production).toBe(args.production);
    done();
  });

  it('can initialize with multiple certs', (done) => {
    var args = [
      {
        cert: 'devCert.pem',
        key: 'devKey.pem',
        production: false,
        bundleId: 'bundleId'
      },
      {
        cert: 'prodCert.pem',
        key: 'prodKey.pem',
        production: true,
        bundleId: 'bundleIdAgain'
      }
    ]

    var apns = new APNS(args);
    expect(apns.conns.length).toBe(2);
    var devApnsConnection = apns.conns[1];
    expect(devApnsConnection.index).toBe(1);
    var devApnsOptions = devApnsConnection.options;
    expect(devApnsOptions.cert).toBe(args[0].cert);
    expect(devApnsOptions.key).toBe(args[0].key);
    expect(devApnsOptions.production).toBe(args[0].production);
    expect(devApnsConnection.bundleId).toBe(args[0].bundleId);

    var prodApnsConnection = apns.conns[0];
    expect(prodApnsConnection.index).toBe(0);
    // TODO: Remove this checking onec we inject APNS
    var prodApnsOptions = prodApnsConnection.options;
    expect(prodApnsOptions.cert).toBe(args[1].cert);
    expect(prodApnsOptions.key).toBe(args[1].key);
    expect(prodApnsOptions.production).toBe(args[1].production);
    expect(prodApnsOptions.bundleId).toBe(args[1].bundleId);
    done();
  });

  it('can generate APNS notification', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert',
      'badge': 100,
      'sound': 'test',
      'content-available': 1,
      'category': 'INVITE_CATEGORY',
      'key': 'value',
      'keyAgain': 'valueAgain'
    };
    var expirationTime = 1454571491354

    var notification = APNS.generateNotification(data, expirationTime);

    expect(notification.alert).toEqual(data.alert);
    expect(notification.badge).toEqual(data.badge);
    expect(notification.sound).toEqual(data.sound);
    expect(notification.contentAvailable).toEqual(1);
    expect(notification.category).toEqual(data.category);
    expect(notification.payload).toEqual({
      'key': 'value',
      'keyAgain': 'valueAgain'
    });
    expect(notification.expiry).toEqual(expirationTime);
    done();
  });

  it('can choose conns for device without appIdentifier', (done) => {
    // Mock conns
    var conns = [
      {
        bundleId: 'bundleId'
      },
      {
        bundleId: 'bundleIdAgain'
      }
    ];
    // Mock device
    var device = {};

    var qualifiedConns = APNS.chooseConns(conns, device);
    expect(qualifiedConns).toEqual([0, 1]);
    done();
  });

  it('can choose conns for device with valid appIdentifier', (done) => {
    // Mock conns
    var conns = [
      {
        bundleId: 'bundleId'
      },
      {
        bundleId: 'bundleIdAgain'
      }
    ];
    // Mock device
    var device = {
      appIdentifier: 'bundleId'
    };

    var qualifiedConns = APNS.chooseConns(conns, device);
    expect(qualifiedConns).toEqual([0]);
    done();
  });

  it('can choose conns for device with invalid appIdentifier', (done) => {
    // Mock conns
    var conns = [
      {
        bundleId: 'bundleId'
      },
      {
        bundleId: 'bundleIdAgain'
      }
    ];
    // Mock device
    var device = {
      appIdentifier: 'invalid'
    };

    var qualifiedConns = APNS.chooseConns(conns, device);
    expect(qualifiedConns).toEqual([]);
    done();
  });

  it('can handle transmission error when notification is not in cache or device is missing', (done) => {
    // Mock conns
    var conns = [];
    var errorCode = 1;
    var notification = undefined;
    var device = {};

    APNS.handleTransmissionError(conns, errorCode, notification, device);

    notification = {};
    device = undefined;

    APNS.handleTransmissionError(conns, errorCode, notification, device);
    done();
  });

  it('can handle transmission error when there are other qualified conns', (done) => {
    // Mock conns
    var conns = [
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId1'
      },
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId1'
      },
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId2'
      }
    ];
    var errorCode = 1;
    var notification = {};
    var apnDevice = {
      connIndex: 0,
      appIdentifier: 'bundleId1'
    };

    APNS.handleTransmissionError(conns, errorCode, notification, apnDevice);

    expect(conns[0].pushNotification).not.toHaveBeenCalled();
    expect(conns[1].pushNotification).toHaveBeenCalled();
    expect(conns[2].pushNotification).not.toHaveBeenCalled();
    done();
  });

  it('can handle transmission error when there is no other qualified conns', (done) => {
    // Mock conns
    var conns = [
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId1'
      },
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId1'
      },
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId1'
      },
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId2'
      },
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId1'
      }
    ];
    var errorCode = 1;
    var notification = {};
    var apnDevice = {
      connIndex: 2,
      appIdentifier: 'bundleId1'
    };

    APNS.handleTransmissionError(conns, errorCode, notification, apnDevice);

    expect(conns[0].pushNotification).not.toHaveBeenCalled();
    expect(conns[1].pushNotification).not.toHaveBeenCalled();
    expect(conns[2].pushNotification).not.toHaveBeenCalled();
    expect(conns[3].pushNotification).not.toHaveBeenCalled();
    expect(conns[4].pushNotification).toHaveBeenCalled();
    done();
  });

  it('can handle transmission error when device has no appIdentifier', (done) => {
    // Mock conns
    var conns = [
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId1'
      },
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId2'
      },
      {
        pushNotification: jasmine.createSpy('pushNotification'),
        bundleId: 'bundleId3'
      }
    ];
    var errorCode = 1;
    var notification = {};
    var apnDevice = {
      connIndex: 1
    };

    APNS.handleTransmissionError(conns, errorCode, notification, apnDevice);

    expect(conns[0].pushNotification).not.toHaveBeenCalled();
    expect(conns[1].pushNotification).not.toHaveBeenCalled();
    expect(conns[2].pushNotification).toHaveBeenCalled();
    done();
  });

  it('can send APNS notification', (done) => {
    var args = {
      cert: 'prodCert.pem',
      key: 'prodKey.pem',
      production: true,
      bundleId: 'bundleId'
    }
    var apns = new APNS(args);
    var conn = {
      pushNotification: jasmine.createSpy('send'),
      bundleId: 'bundleId'
    };
    apns.conns = [ conn ];
    // Mock data
    var expirationTime = 1454571491354
    var data = {
      'expiration_time': expirationTime,
      'data': {
        'alert': 'alert'
      }
    }
    // Mock devices
    var devices = [
      {
        deviceToken: '112233',
        appIdentifier: 'bundleId'
      }
    ];

    apns.send(data, devices);
    expect(conn.pushNotification).toHaveBeenCalled();
    var receivedArgs = conn.pushNotification.calls.first().args;
    var notification = receivedArgs[0];
    expect(notification.alert).toEqual(data.data.alert);
    expect(notification.expiry).toEqual(data['expiration_time']);
    var apnDevice = receivedArgs[1]
    expect(apnDevice.connIndex).toEqual(0);
    expect(apnDevice.appIdentifier).toEqual('bundleId');
    done();
  });
});
