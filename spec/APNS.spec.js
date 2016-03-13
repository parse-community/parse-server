'use strict';
var APNS = require('../src/APNS');

describe('APNS', () => {

  it('can initialize with single cert', (done) => {
    var args = {
      cert: 'prodCert.pem',
      key: 'prodKey.pem',
      production: true,
      bundleId: 'bundleId'
    }
    var apns = APNS(args);

    var apnsConfiguration = apns.getConfiguration();
    expect(apnsConfiguration.bundleId).toBe(args.bundleId);
    expect(apnsConfiguration.cert).toBe(args.cert);
    expect(apnsConfiguration.key).toBe(args.key);
    expect(apnsConfiguration.production).toBe(args.production);
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

    var apns = APNS(args);
    var devApnsConfiguration = apns.getConfiguration('bundleId');
    expect(devApnsConfiguration.cert).toBe(args[0].cert);
    expect(devApnsConfiguration.key).toBe(args[0].key);
    expect(devApnsConfiguration.production).toBe(args[0].production);
    expect(devApnsConfiguration.bundleId).toBe(args[0].bundleId);

    var prodApnsConfiguration = apns.getConfiguration('bundleIdAgain');
    expect(prodApnsConfiguration.cert).toBe(args[1].cert);
    expect(prodApnsConfiguration.key).toBe(args[1].key);
    expect(prodApnsConfiguration.production).toBe(args[1].production);
    expect(prodApnsConfiguration.bundleId).toBe(args[1].bundleId);
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

    var notification = APNS.generateNotification(data);
    expect(notification.aps.alert).toEqual(data.alert);
    expect(notification.aps.badge).toEqual(data.badge);
    expect(notification.aps.sound).toEqual(data.sound);
    expect(notification.aps['content-available']).toEqual(1);
    expect(notification.aps.category).toEqual(data.category);
    expect(notification.key).toEqual('value');
    expect(notification.keyAgain).toEqual('valueAgain');
    done();
  });

  it('can choose conns for device with invalid appIdentifier', (done) => {
    // Mock conns
    var conns = [
      {
        bundleId: 'bundleId',
      },
      {
        bundleId: 'bundleIdAgain'
      }
    ];
    // Mock device
    var device = {
      appIdentifier: 'invalid'
    };
    let apns = APNS(conns);
    var config = apns.getConfiguration(device.appIdentifier);
    expect(config).toBeUndefined();
    done();
  });

  it('can send APNS notification', (done) => {
    var args = {
      production: true,
      bundleId: 'bundleId'
    }
    var apns = APNS(args);
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

    apns.send(data, devices).then((results) => {
      let isArray = Array.isArray(results);
      expect(isArray).toBe(true);
      expect(results.length).toBe(1);
      // No provided certificates
      expect(results[0].status).toBe(403);
      expect(results[0].device).toEqual(devices[0]);
      expect(results[0].transmitted).toBe(false);
      done();
    }, (err) => {
      fail('should not fail');
      done();
    });
  });
});
