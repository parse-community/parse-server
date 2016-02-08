var APNS = require('../src/APNS');

describe('APNS', () => {
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

  it('can send APNS notification', (done) => {
    var apns = new APNS();
    var sender = {
      pushNotification: jasmine.createSpy('send')
    };
    apns.sender = sender;
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
      { deviceToken: 'token' }
    ];

    var promise = apns.send(data, devices);
    expect(sender.pushNotification).toHaveBeenCalled();
    var args = sender.pushNotification.calls.first().args;
    var notification = args[0];
    expect(notification.alert).toEqual(data.data.alert);
    expect(notification.expiry).toEqual(data['expiration_time']);
    expect(args[1]).toEqual(['token']);
    done();
  });
});
