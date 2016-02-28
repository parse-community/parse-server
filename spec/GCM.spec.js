var GCM = require('../src/GCM').GCM;

describe('GCM', () => {
  it('can initialize', (done) => {
    var args = {
      apiKey: 'apiKey'
    };
    var gcm = new GCM(args);
    expect(gcm.sender.key).toBe(args.apiKey);
    done();
  });

  it('can throw on initializing with invalid args', (done) => {
    var args = 123
    expect(function() {
      new GCM(args);
    }).toThrow();
    done();
  });

  it('can generate GCM Payload without expiration time', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert'
    };
    var timeStamp = 1454538822113;
    var timeStampISOStr = new Date(timeStamp).toISOString();

    var payload = GCM.generateGCMPayload(data, timeStamp);

    expect(payload.priority).toEqual('normal');
    expect(payload.timeToLive).toEqual(undefined);
    var dataFromPayload = payload.data;
    expect(dataFromPayload.time).toEqual(timeStampISOStr);
    var dataFromUser = JSON.parse(dataFromPayload.data);
    expect(dataFromUser).toEqual(data);
    done();
  });

  it('can generate GCM Payload with valid expiration time', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert'
    };
    var timeStamp = 1454538822113;
    var timeStampISOStr = new Date(timeStamp).toISOString();
    var expirationTime = 1454538922113

    var payload = GCM.generateGCMPayload(data, timeStamp, expirationTime);

    expect(payload.priority).toEqual('normal');
    expect(payload.timeToLive).toEqual(Math.floor((expirationTime - timeStamp) / 1000));
    var dataFromPayload = payload.data;
    expect(dataFromPayload.time).toEqual(timeStampISOStr);
    var dataFromUser = JSON.parse(dataFromPayload.data);
    expect(dataFromUser).toEqual(data);
    done();
  });

  it('can generate GCM Payload with too early expiration time', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert'
    };
    var timeStamp = 1454538822113;
    var timeStampISOStr = new Date(timeStamp).toISOString();
    var expirationTime = 1454538822112;

    var payload = GCM.generateGCMPayload(data, timeStamp, expirationTime);

    expect(payload.priority).toEqual('normal');
    expect(payload.timeToLive).toEqual(0);
    var dataFromPayload = payload.data;
    expect(dataFromPayload.time).toEqual(timeStampISOStr);
    var dataFromUser = JSON.parse(dataFromPayload.data);
    expect(dataFromUser).toEqual(data);
    done();
  });

  it('can generate GCM Payload with too late expiration time', (done) => {
    //Mock request data
    var data = {
      'alert': 'alert'
    };
    var timeStamp = 1454538822113;
    var timeStampISOStr = new Date(timeStamp).toISOString();
    var expirationTime = 2454538822113;

    var payload = GCM.generateGCMPayload(data, timeStamp, expirationTime);

    expect(payload.priority).toEqual('normal');
    // Four week in second
    expect(payload.timeToLive).toEqual(4 * 7 * 24 * 60 * 60);
    var dataFromPayload = payload.data;
    expect(dataFromPayload.time).toEqual(timeStampISOStr);
    var dataFromUser = JSON.parse(dataFromPayload.data);
    expect(dataFromUser).toEqual(data);
    done();
  });

  it('can send GCM request', (done) => {
    var gcm = new GCM({
      apiKey: 'apiKey'
    });
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
    // Mock devices
    var devices = [
      {
        deviceToken: 'token'
      }
    ];

    gcm.send(data, devices);
    expect(sender.send).toHaveBeenCalled();
    var args = sender.send.calls.first().args;
    // It is too hard to verify message of gcm library, we just verify tokens and retry times
    expect(args[1].registrationTokens).toEqual(['token']);
    expect(args[2]).toEqual(5);
    done();
  });

  it('can send GCM request', (done) => {
    var gcm = new GCM({
      apiKey: 'apiKey'
    });
    // Mock data
    var expirationTime = 2454538822113;
    var data = {
      'expiration_time': expirationTime,
      'data': {
        'alert': 'alert'
      }
    }
    // Mock devices
    var devices = [
      {
        deviceToken: 'token'
      },
      {
        deviceToken: 'token2'
      },
      {
        deviceToken: 'token3'
      },
      {
        deviceToken: 'token4'
      }
    ];

    gcm.send(data, devices).then((response) => {
      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toEqual(devices.length);
      expect(response.length).toEqual(4);
      response.forEach((res, index) => {
        expect(res.transmitted).toEqual(false);
        expect(res.device).toEqual(devices[index]);
      })
      done();
    })
  });

  it('can slice devices', (done) => {
    // Mock devices
    var devices = [makeDevice(1), makeDevice(2), makeDevice(3), makeDevice(4)];

    var chunkDevices = GCM.sliceDevices(devices, 3);
    expect(chunkDevices).toEqual([
      [makeDevice(1), makeDevice(2), makeDevice(3)],
      [makeDevice(4)]
    ]);
    done();
  });

  function makeDevice(deviceToken) {
    return {
      deviceToken: deviceToken
    };
  }
});
