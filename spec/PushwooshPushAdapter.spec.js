'use strict';

const PushwooshPushAdapter = require('../src/Adapters/Push/PushwooshPushAdapter');

const pushConfig = {
  applicationCode: 'APP CODE',
  apiAccessKey: 'ACCESS KEY'
};

describe('PushwooshPushAdapter', () => {
  it('can be initialized', (done) => {

    const pushwooshPushAdapter = new PushwooshPushAdapter(pushConfig);

    const pushwooshConfig = pushwooshPushAdapter.pushwooshConfig;

    expect(pushwooshConfig.application).toBe(pushConfig.applicationCode);
    expect(pushwooshConfig.auth).toBe(pushConfig.apiAccessKey);
    done();
  });

  it('cannot be initialized if options are missing', (done) => {

    expect(() => {
      new PushwooshPushAdapter();
    }).toThrow("Trying to initialize PushwooshPushAdapter without applicationCode or apiAccessKey");
    done();
  });

  it('can get valid push types', (done) => {
    var pushwooshPushAdapter = new PushwooshPushAdapter(pushConfig);

    expect(pushwooshPushAdapter.getValidPushTypes()).toEqual(['ios', 'android']);
    done();
  });

  it('can get valid tokens', (done) => {
    // Mock installations
    const validPushTypes = ['ios', 'android'];
    const installations = [
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
        deviceType: 'android'
      }
    ];

    const pushwooshPushAdapter = new PushwooshPushAdapter(pushConfig);
    pushwooshPushAdapter.validPushTypes = validPushTypes;

    const tokens = pushwooshPushAdapter.getValidTokens(installations);

    expect(tokens.length).toBe(2);
    expect(tokens).toContain(installations[0].deviceToken);
    expect(tokens).toContain(installations[1].deviceToken);

    done();
  });

  it('should split installations to multiple requests', (done) => {
    const validPushTypes = ['ios', 'android'];
    const installations = 'installations';
    const data = {
      data: {
        alert: 'alert'
      }
    };

    const pushwooshPushAdapter = new PushwooshPushAdapter(Object.assign({}, pushConfig, {maxTokensPerRequest: 2}));
    pushwooshPushAdapter.validPushTypes = validPushTypes;
    spyOn(pushwooshPushAdapter, 'makeNotification');
    spyOn(pushwooshPushAdapter, 'sendRequest').and.returnValue(Promise.resolve());
    spyOn(pushwooshPushAdapter, 'getValidTokens').and.returnValue(['token1', 'token2', 'token3', 'token4', 'token5']);

    pushwooshPushAdapter.send(data, installations).then(()=> {
      expect(pushwooshPushAdapter.makeNotification.calls.count()).toEqual(3);
      expect(pushwooshPushAdapter.makeNotification.calls.argsFor(0)).toEqual([data.data, ['token1', 'token2']]);
      expect(pushwooshPushAdapter.makeNotification.calls.argsFor(1)).toEqual([data.data, ['token3', 'token4']]);
      expect(pushwooshPushAdapter.makeNotification.calls.argsFor(2)).toEqual([data.data, ['token5']]);
      expect(pushwooshPushAdapter.sendRequest.calls.count()).toEqual(3);
      done();
    }, err => {
      fail(err);
      done()
    });
  });

  it('can make notification', (done) => {
    const pushwooshPushAdapter = new PushwooshPushAdapter(pushConfig);
    const devices = 'devices';
    const alert = 'alert';
    const sound = 'sound';
    const title = 'title';
    const uri = 'uri';

    const notification = pushwooshPushAdapter.makeNotification({
      alert,
      sound,
      title,
      uri,
      'content-available': 1,
      foo: 'bar'
    }, devices);

    expect(notification).toEqual({
      send_date: 'now',
      devices: devices,
      content: {en: alert},
      ios_sound: 'sound',
      android_header: 'title',
      link: 'uri',
      ios_root_params: {
        aps: {
          'content-available': '1'
        }
      },
      data: {foo: 'bar'}
    });

    done();
  });

  it('can make notification with increment badge', (done) => {
    const pushwooshPushAdapter = new PushwooshPushAdapter(pushConfig);
    const devices = 'devices';

    const notification = pushwooshPushAdapter.makeNotification({badge: 'Increment'}, devices);
    expect(notification).toEqual({
      send_date: 'now',
      devices: devices,
      ios_badges: '+1',
      android_badges: '+1'
    });

    done();
  });

  it('can make notification with set badge', (done) => {
    const pushwooshPushAdapter = new PushwooshPushAdapter(pushConfig);
    const devices = 'devices';
    const badge = 5;

    const notification = pushwooshPushAdapter.makeNotification({badge}, devices);
    expect(notification).toEqual({
      send_date: 'now',
      devices: devices,
      ios_badges: badge,
      android_badges: badge
    });

    done();
  });

  it('can make notification without badge if badge is null or undefined', (done) => {
    const pushwooshPushAdapter = new PushwooshPushAdapter(pushConfig);
    const devices = 'devices';

    const notification1 = pushwooshPushAdapter.makeNotification({badge: null}, devices);
    expect(notification1).toEqual({
      send_date: 'now',
      devices: devices
    });

    const notification2 = pushwooshPushAdapter.makeNotification({badge: undefined}, devices);
    expect(notification2).toEqual({
      send_date: 'now',
      devices: devices
    });

    done();
  });


  describe('test sendRequest', () => {
    const notification = 'notification';
    const pushwooshConfig = {pushwooshConfig: 'pushwooshConfig'};
    let pushwooshPushAdapter, requestResult;

    beforeEach(() => {
      pushwooshPushAdapter = new PushwooshPushAdapter(pushConfig);
      pushwooshPushAdapter.pushwooshConfig = pushwooshConfig;

      requestResult = {
        on: jasmine.createSpy('request.on'),
        end: jasmine.createSpy('request.end')
      };
    });


    it('should send https request and resolve promise if statusCode is 200', (done) => {
      pushwooshPushAdapter.https = {
        request: jasmine.createSpy('request').and.callFake((requestOptions, callback) => {
          expect(requestOptions).toEqual(pushwooshPushAdapter.requestOptions);
          callback({statusCode: 200});
          return requestResult;
        })
      };

      pushwooshPushAdapter.sendRequest(notification).then(() => {
        expect(requestResult.on.calls.count()).toEqual(1);
        expect(JSON.parse(requestResult.end.calls.argsFor(0))).toEqual({
          request: Object.assign({notifications: [notification]}, pushwooshConfig)
        });

        done();
      });
    });

    it('should send https request and reject promise if statusCode more than 200', (done) => {
      const resOn = jasmine.createSpy('res.on');
      pushwooshPushAdapter.https = {
        request: jasmine.createSpy('request').and.callFake((requestOptions, callback) => {
          expect(requestOptions).toEqual(pushwooshPushAdapter.requestOptions);
          callback({
            statusCode: 300,
            on: resOn
          });
          return requestResult;
        })
      };

      pushwooshPushAdapter.sendRequest(notification).then(null, () => {
        expect(requestResult.on.calls.count()).toEqual(1);
        expect(JSON.parse(requestResult.end.calls.argsFor(0))).toEqual({
          request: Object.assign({notifications: [notification]}, pushwooshConfig)
        });
        expect(resOn.calls.count()).toEqual(1);

        done();
      });
    });

  });

});