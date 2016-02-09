var GCM = require('../src/GCM');

describe('GCM', () => {
  it('can generate GCM Payload without expiration time', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert'
    };
    var pushId = 1;
    var timeStamp = 1454538822113;
    var timeStampISOStr = new Date(timeStamp).toISOString();

    var payload = GCM.generateGCMPayload(data, pushId, timeStamp);

    expect(payload.priority).toEqual('normal');
    expect(payload.timeToLive).toEqual(undefined);
    var dataFromPayload = payload.data;
    expect(dataFromPayload.time).toEqual(timeStampISOStr);
    expect(dataFromPayload['push_id']).toEqual(pushId);
    var dataFromUser = JSON.parse(dataFromPayload.data);
    expect(dataFromUser).toEqual(data);
    done();
  });

  it('can generate GCM Payload with valid expiration time', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert'
    };
    var pushId = 1;
    var timeStamp = 1454538822113;
    var timeStampISOStr = new Date(timeStamp).toISOString();
    var expirationTime = 1454538922113

    var payload = GCM.generateGCMPayload(data, pushId, timeStamp, expirationTime);

    expect(payload.priority).toEqual('normal');
    expect(payload.timeToLive).toEqual(Math.floor((expirationTime - timeStamp) / 1000));
    var dataFromPayload = payload.data;
    expect(dataFromPayload.time).toEqual(timeStampISOStr);
    expect(dataFromPayload['push_id']).toEqual(pushId);
    var dataFromUser = JSON.parse(dataFromPayload.data);
    expect(dataFromUser).toEqual(data);
    done();
  });

  it('can generate GCM Payload with too early expiration time', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert'
    };
    var pushId = 1;
    var timeStamp = 1454538822113;
    var timeStampISOStr = new Date(timeStamp).toISOString();
    var expirationTime = 1454538822112;

    var payload = GCM.generateGCMPayload(data, pushId, timeStamp, expirationTime);

    expect(payload.priority).toEqual('normal');
    expect(payload.timeToLive).toEqual(0);
    var dataFromPayload = payload.data;
    expect(dataFromPayload.time).toEqual(timeStampISOStr);
    expect(dataFromPayload['push_id']).toEqual(pushId);
    var dataFromUser = JSON.parse(dataFromPayload.data);
    expect(dataFromUser).toEqual(data);
    done();
  });

  it('can generate GCM Payload with too late expiration time', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert'
    };
    var pushId = 1;
    var timeStamp = 1454538822113;
    var timeStampISOStr = new Date(timeStamp).toISOString();
    var expirationTime = 2454538822113;

    var payload = GCM.generateGCMPayload(data, pushId, timeStamp, expirationTime);

    expect(payload.priority).toEqual('normal');
    // Four week in second
    expect(payload.timeToLive).toEqual(4 * 7 * 24 * 60 * 60);
    var dataFromPayload = payload.data;
    expect(dataFromPayload.time).toEqual(timeStampISOStr);
    expect(dataFromPayload['push_id']).toEqual(pushId);
    var dataFromUser = JSON.parse(dataFromPayload.data);
    expect(dataFromUser).toEqual(data);
    done();
  });

  it('can send GCM request', (done) => {
    var gcm = new GCM('apiKey');
    // Mock gcm sender
    var sender = {
      send: jasmine.createSpy('send')
    };
    gcm.sender = sender;
    // Mock data
    var expirationTime = 2454538822113;
    var data = {
      'expiration_time': expirationTime,
      'data': {
        'alert': 'alert'
      }
    }
    // Mock registrationTokens
    var registrationTokens = ['token'];

    var promise = gcm.send(data, registrationTokens);
    expect(sender.send).toHaveBeenCalled();
    var args = sender.send.calls.first().args;
    // It is too hard to verify message of gcm library, we just verify tokens and retry times
    expect(args[1].registrationTokens).toEqual(registrationTokens);
    expect(args[2]).toEqual(5);
    done();
  });

  it('can throw on sending when we have too many registration tokens', (done) => {
    var gcm = new GCM('apiKey');
    // Mock gcm sender
    var sender = {
      send: jasmine.createSpy('send')
    };
    gcm.sender = sender;
    // Mock registrationTokens
    var registrationTokens = [];
    for (var i = 0; i <= 2000; i++) {
      registrationTokens.push(i.toString());
    }

    expect(function() {
      gcm.send({}, registrationTokens);
    }).toThrow();
    done();
  });
});
