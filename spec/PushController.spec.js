'use strict';
const PushController = require('../lib/Controllers/PushController').PushController;
const StatusHandler = require('../lib/StatusHandler');
const Config = require('../lib/Config');
const validatePushType = require('../lib/Push/utils').validatePushType;

const successfulTransmissions = function (body, installations) {
  const promises = installations.map(device => {
    return Promise.resolve({
      transmitted: true,
      device: device,
    });
  });

  return Promise.all(promises);
};

const successfulIOS = function (body, installations) {
  const promises = installations.map(device => {
    return Promise.resolve({
      transmitted: device.deviceType == 'ios',
      device: device,
    });
  });

  return Promise.all(promises);
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const pushCompleted = async pushId => {
  const query = new Parse.Query('_PushStatus');
  query.equalTo('objectId', pushId);
  let result = await query.first({ useMasterKey: true });
  while (!(result && result.get('status') === 'succeeded')) {
    await sleep(100);
    result = await query.first({ useMasterKey: true });
  }
};

const sendPush = (body, where, config, auth, now) => {
  const pushController = new PushController();
  return new Promise((resolve, reject) => {
    pushController.sendPush(body, where, config, auth, resolve, now).catch(reject);
  });
};

describe('PushController', () => {
  it('can validate device type when no device type is set', done => {
    // Make query condition
    const where = {};
    const validPushTypes = ['ios', 'android'];

    expect(function () {
      validatePushType(where, validPushTypes);
    }).not.toThrow();
    done();
  });

  it('can validate device type when single valid device type is set', done => {
    // Make query condition
    const where = {
      deviceType: 'ios',
    };
    const validPushTypes = ['ios', 'android'];

    expect(function () {
      validatePushType(where, validPushTypes);
    }).not.toThrow();
    done();
  });

  it('can validate device type when multiple valid device types are set', done => {
    // Make query condition
    const where = {
      deviceType: {
        $in: ['android', 'ios'],
      },
    };
    const validPushTypes = ['ios', 'android'];

    expect(function () {
      validatePushType(where, validPushTypes);
    }).not.toThrow();
    done();
  });

  it('can throw on validateDeviceType when single invalid device type is set', done => {
    // Make query condition
    const where = {
      deviceType: 'osx',
    };
    const validPushTypes = ['ios', 'android'];

    expect(function () {
      validatePushType(where, validPushTypes);
    }).toThrow();
    done();
  });

  it('can get expiration time in string format', done => {
    // Make mock request
    const timeStr = '2015-03-19T22:05:08Z';
    const body = {
      expiration_time: timeStr,
    };

    const time = PushController.getExpirationTime(body);
    expect(time).toEqual(new Date(timeStr).valueOf());
    done();
  });

  it('can get expiration time in number format', done => {
    // Make mock request
    const timeNumber = 1426802708;
    const body = {
      expiration_time: timeNumber,
    };

    const time = PushController.getExpirationTime(body);
    expect(time).toEqual(timeNumber * 1000);
    done();
  });

  it('can throw on getExpirationTime in invalid format', done => {
    // Make mock request
    const body = {
      expiration_time: 'abcd',
    };

    expect(function () {
      PushController.getExpirationTime(body);
    }).toThrow();
    done();
  });

  it('can get push time in string format', done => {
    // Make mock request
    const timeStr = '2015-03-19T22:05:08Z';
    const body = {
      push_time: timeStr,
    };

    const { date } = PushController.getPushTime(body);
    expect(date).toEqual(new Date(timeStr));
    done();
  });

  it('can get push time in number format', done => {
    // Make mock request
    const timeNumber = 1426802708;
    const body = {
      push_time: timeNumber,
    };

    const { date } = PushController.getPushTime(body);
    expect(date.valueOf()).toEqual(timeNumber * 1000);
    done();
  });

  it('can throw on getPushTime in invalid format', done => {
    // Make mock request
    const body = {
      push_time: 'abcd',
    };

    expect(function () {
      PushController.getPushTime(body);
    }).toThrow();
    done();
  });

  it('properly increment badges', async () => {
    const pushAdapter = {
      send: function (body, installations) {
        const badge = body.data.badge;
        installations.forEach(installation => {
          expect(installation.badge).toEqual(badge);
          expect(installation.originalBadge + 1).toEqual(installation.badge);
        });
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios', 'android'];
      },
    };
    const payload = {
      data: {
        alert: 'Hello World!',
        badge: 'Increment',
      },
    };
    const installations = [];
    while (installations.length != 10) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }

    while (installations.length != 15) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'android');
      installations.push(installation);
    }
    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, {}, config, auth);
    await pushCompleted(pushStatusId);

    // Check we actually sent 15 pushes.
    const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
    expect(pushStatus.get('numSent')).toBe(15);

    // Check that the installations were actually updated.
    const query = new Parse.Query('_Installation');
    const results = await query.find({ useMasterKey: true });
    expect(results.length).toBe(15);
    for (let i = 0; i < 15; i++) {
      const installation = results[i];
      expect(installation.get('badge')).toBe(parseInt(installation.get('originalBadge')) + 1);
    }
  });

  it('properly increment badges by more than 1', async () => {
    const pushAdapter = {
      send: function (body, installations) {
        const badge = body.data.badge;
        installations.forEach(installation => {
          expect(installation.badge).toEqual(badge);
          expect(installation.originalBadge + 3).toEqual(installation.badge);
        });
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios', 'android'];
      },
    };
    const payload = {
      data: {
        alert: 'Hello World!',
        badge: { __op: 'Increment', amount: 3 },
      },
    };
    const installations = [];
    while (installations.length != 10) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }

    while (installations.length != 15) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'android');
      installations.push(installation);
    }
    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, {}, config, auth);
    await pushCompleted(pushStatusId);
    const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
    expect(pushStatus.get('numSent')).toBe(15);
    // Check that the installations were actually updated.
    const query = new Parse.Query('_Installation');
    const results = await query.find({ useMasterKey: true });
    expect(results.length).toBe(15);
    for (let i = 0; i < 15; i++) {
      const installation = results[i];
      expect(installation.get('badge')).toBe(parseInt(installation.get('originalBadge')) + 3);
    }
  });

  it('properly set badges to 1', async () => {
    const pushAdapter = {
      send: function (body, installations) {
        const badge = body.data.badge;
        installations.forEach(installation => {
          expect(installation.badge).toEqual(badge);
          expect(1).toEqual(installation.badge);
        });
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };

    const payload = {
      data: {
        alert: 'Hello World!',
        badge: 1,
      },
    };
    const installations = [];
    while (installations.length != 10) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }

    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, {}, config, auth);
    await pushCompleted(pushStatusId);
    const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
    expect(pushStatus.get('numSent')).toBe(10);

    // Check that the installations were actually updated.
    const query = new Parse.Query('_Installation');
    const results = await query.find({ useMasterKey: true });
    expect(results.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      const installation = results[i];
      expect(installation.get('badge')).toBe(1);
    }
  });

  it('properly set badges to 1 with complex query #2903 #3022', async () => {
    const payload = {
      data: {
        alert: 'Hello World!',
        badge: 1,
      },
    };
    const installations = [];
    while (installations.length != 10) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    let matchedInstallationsCount = 0;
    const pushAdapter = {
      send: function (body, installations) {
        matchedInstallationsCount += installations.length;
        const badge = body.data.badge;
        installations.forEach(installation => {
          expect(installation.badge).toEqual(badge);
          expect(1).toEqual(installation.badge);
        });
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };

    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    await Parse.Object.saveAll(installations);
    const objectIds = installations.map(installation => {
      return installation.id;
    });
    const where = {
      objectId: { $in: objectIds.slice(0, 5) },
    };
    const pushStatusId = await sendPush(payload, where, config, auth);
    await pushCompleted(pushStatusId);
    expect(matchedInstallationsCount).toBe(5);
    const query = new Parse.Query(Parse.Installation);
    query.equalTo('badge', 1);
    const results = await query.find({ useMasterKey: true });
    expect(results.length).toBe(5);
  });

  it('properly creates _PushStatus', async () => {
    const pushStatusAfterSave = {
      handler: function () {},
    };
    const spy = spyOn(pushStatusAfterSave, 'handler').and.callThrough();
    Parse.Cloud.afterSave('_PushStatus', pushStatusAfterSave.handler);
    const installations = [];
    while (installations.length != 10) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }

    while (installations.length != 15) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('deviceType', 'android');
      installations.push(installation);
    }
    const payload = {
      data: {
        alert: 'Hello World!',
        badge: 1,
      },
    };

    const pushAdapter = {
      send: function (body, installations) {
        return successfulIOS(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };

    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, {}, config, auth);
    await pushCompleted(pushStatusId);
    const result = await Parse.Push.getPushStatus(pushStatusId);
    expect(result.createdAt instanceof Date).toBe(true);
    expect(result.updatedAt instanceof Date).toBe(true);
    expect(result.id.length).toBe(10);
    expect(result.get('source')).toEqual('rest');
    expect(result.get('query')).toEqual(JSON.stringify({}));
    expect(typeof result.get('payload')).toEqual('string');
    expect(JSON.parse(result.get('payload'))).toEqual(payload.data);
    expect(result.get('status')).toEqual('succeeded');
    expect(result.get('numSent')).toEqual(10);
    expect(result.get('sentPerType')).toEqual({
      ios: 10, // 10 ios
    });
    expect(result.get('numFailed')).toEqual(5);
    expect(result.get('failedPerType')).toEqual({
      android: 5, // android
    });
    try {
      // Try to get it without masterKey
      const query = new Parse.Query('_PushStatus');
      await query.find();
      fail();
    } catch (error) {
      expect(error.code).toBe(119);
    }

    function getPushStatus(callIndex) {
      return spy.calls.all()[callIndex].args[0].object;
    }
    expect(spy).toHaveBeenCalled();
    expect(spy.calls.count()).toBe(4);
    const allCalls = spy.calls.all();
    let pendingCount = 0;
    let runningCount = 0;
    let succeedCount = 0;
    allCalls.forEach((call, index) => {
      expect(call.args.length).toBe(1);
      const object = call.args[0].object;
      expect(object instanceof Parse.Object).toBe(true);
      const pushStatus = getPushStatus(index);
      if (pushStatus.get('status') === 'pending') {
        pendingCount += 1;
      }
      if (pushStatus.get('status') === 'running') {
        runningCount += 1;
      }
      if (pushStatus.get('status') === 'succeeded') {
        succeedCount += 1;
      }
      if (pushStatus.get('status') === 'running' && pushStatus.get('numSent') > 0) {
        expect(pushStatus.get('numSent')).toBe(10);
        expect(pushStatus.get('numFailed')).toBe(5);
        expect(pushStatus.get('failedPerType')).toEqual({
          android: 5,
        });
        expect(pushStatus.get('sentPerType')).toEqual({
          ios: 10,
        });
      }
    });
    expect(pendingCount).toBe(1);
    expect(runningCount).toBe(2);
    expect(succeedCount).toBe(1);
  });

  it('properly creates _PushStatus without serverURL', async () => {
    const pushStatusAfterSave = {
      handler: function () {},
    };
    Parse.Cloud.afterSave('_PushStatus', pushStatusAfterSave.handler);
    const installation = new Parse.Object('_Installation');
    installation.set('installationId', 'installation');
    installation.set('deviceToken', 'device_token');
    installation.set('badge', 0);
    installation.set('originalBadge', 0);
    installation.set('deviceType', 'ios');

    const payload = {
      data: {
        alert: 'Hello World!',
        badge: 1,
      },
    };

    const pushAdapter = {
      send: function (body, installations) {
        return successfulIOS(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };

    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    await installation.save();
    await reconfigureServer({
      serverURL: 'http://localhost:8378/', // server with borked URL
      push: { adapter: pushAdapter },
    });
    const pushStatusId = await sendPush(payload, {}, config, auth);
    // it is enqueued so it can take time
    await sleep(1000);
    Parse.serverURL = 'http://localhost:8378/1'; // GOOD url
    const result = await Parse.Push.getPushStatus(pushStatusId);
    expect(result).toBeDefined();
    await pushCompleted(pushStatusId);
  });

  it('should properly report failures in _PushStatus', async () => {
    const pushAdapter = {
      send: function (body, installations) {
        return installations.map(installation => {
          return Promise.resolve({
            deviceType: installation.deviceType,
          });
        });
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };
    // $ins is invalid query
    const where = {
      channels: {
        $ins: ['Giants', 'Mets'],
      },
    };
    const payload = {
      data: {
        alert: 'Hello World!',
        badge: 1,
      },
    };
    const auth = {
      isMaster: true,
    };
    const pushController = new PushController();
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    const config = Config.get(Parse.applicationId);
    try {
      await pushController.sendPush(payload, where, config, auth);
      fail();
    } catch (e) {
      const query = new Parse.Query('_PushStatus');
      let results = await query.find({ useMasterKey: true });
      while (results.length === 0) {
        results = await query.find({ useMasterKey: true });
      }
      expect(results.length).toBe(1);
      const pushStatus = results[0];
      expect(pushStatus.get('status')).toBe('failed');
    }
  });

  it('should support full RESTQuery for increment', async () => {
    const payload = {
      data: {
        alert: 'Hello World!',
        badge: 'Increment',
      },
    };

    const pushAdapter = {
      send: function (body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };
    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };

    const where = {
      deviceToken: {
        $in: ['device_token_0', 'device_token_1', 'device_token_2'],
      },
    };
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    const installations = [];
    while (installations.length != 5) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, where, config, auth);
    await pushCompleted(pushStatusId);
    const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
    expect(pushStatus.get('numSent')).toBe(3);
  });

  it('should support object type for alert', async () => {
    const payload = {
      data: {
        alert: {
          'loc-key': 'hello_world',
        },
      },
    };

    const pushAdapter = {
      send: function (body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };

    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    const where = {
      deviceType: 'ios',
    };
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    const installations = [];
    while (installations.length != 5) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, where, config, auth);
    await pushCompleted(pushStatusId);
    const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
    expect(pushStatus.get('numSent')).toBe(5);
  });

  it('should flatten', () => {
    const res = StatusHandler.flatten([1, [2], [[3, 4], 5], [[[6]]]]);
    expect(res).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('properly transforms push time', () => {
    expect(PushController.getPushTime()).toBe(undefined);
    expect(
      PushController.getPushTime({
        push_time: 1000,
      }).date
    ).toEqual(new Date(1000 * 1000));
    expect(
      PushController.getPushTime({
        push_time: '2017-01-01',
      }).date
    ).toEqual(new Date('2017-01-01'));

    expect(() => {
      PushController.getPushTime({
        push_time: 'gibberish-time',
      });
    }).toThrow();
    expect(() => {
      PushController.getPushTime({
        push_time: Number.NaN,
      });
    }).toThrow();

    expect(
      PushController.getPushTime({
        push_time: '2017-09-06T13:42:48.369Z',
      })
    ).toEqual({
      date: new Date('2017-09-06T13:42:48.369Z'),
      isLocalTime: false,
    });
    expect(
      PushController.getPushTime({
        push_time: '2007-04-05T12:30-02:00',
      })
    ).toEqual({
      date: new Date('2007-04-05T12:30-02:00'),
      isLocalTime: false,
    });
    expect(
      PushController.getPushTime({
        push_time: '2007-04-05T12:30',
      })
    ).toEqual({
      date: new Date('2007-04-05T12:30'),
      isLocalTime: true,
    });
  });

  it('should not schedule push when not configured', async () => {
    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    const pushAdapter = {
      send: function (body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };

    const pushController = new PushController();
    const payload = {
      data: {
        alert: 'hello',
      },
      push_time: new Date().getTime(),
    };

    const installations = [];
    while (installations.length != 10) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }

    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    await Parse.Object.saveAll(installations);
    await pushController.sendPush(payload, {}, config, auth);
    await sleep(1000);
    const query = new Parse.Query('_PushStatus');
    const results = await query.find({ useMasterKey: true });
    expect(results.length).toBe(1);
    const pushStatus = results[0];
    expect(pushStatus.get('status')).not.toBe('scheduled');
  });

  it('should schedule push when configured', async () => {
    const auth = {
      isMaster: true,
    };
    const pushAdapter = {
      send: function (body, installations) {
        const promises = installations.map(device => {
          if (!device.deviceToken) {
            // Simulate error when device token is not set
            return Promise.reject();
          }
          return Promise.resolve({
            transmitted: true,
            device: device,
          });
        });

        return Promise.all(promises);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };
    const pushController = new PushController();
    const payload = {
      data: {
        alert: 'hello',
      },
      push_time: new Date().getTime() / 1000,
    };
    const installations = [];
    while (installations.length != 10) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    await reconfigureServer({
      push: { adapter: pushAdapter },
      scheduledPush: true,
    });
    const config = Config.get(Parse.applicationId);
    await Parse.Object.saveAll(installations);
    await pushController.sendPush(payload, {}, config, auth);
    await sleep(1000);
    const query = new Parse.Query('_PushStatus');
    const results = await query.find({ useMasterKey: true });
    expect(results.length).toBe(1);
    const pushStatus = results[0];
    expect(pushStatus.get('status')).toBe('scheduled');
  });

  it('should not enqueue push when device token is not set', async () => {
    const auth = {
      isMaster: true,
    };
    const pushAdapter = {
      send: function (body, installations) {
        const promises = installations.map(device => {
          if (!device.deviceToken) {
            // Simulate error when device token is not set
            return Promise.reject();
          }
          return Promise.resolve({
            transmitted: true,
            device: device,
          });
        });

        return Promise.all(promises);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };
    const payload = {
      data: {
        alert: 'hello',
      },
      push_time: new Date().getTime() / 1000,
    };
    const installations = [];
    while (installations.length != 5) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    while (installations.length != 15) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    const config = Config.get(Parse.applicationId);
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, {}, config, auth);
    await pushCompleted(pushStatusId);
    const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
    expect(pushStatus.get('numSent')).toBe(5);
    expect(pushStatus.get('status')).toBe('succeeded');
  });

  it('should not mark the _PushStatus as failed when audience has no deviceToken', async () => {
    const auth = {
      isMaster: true,
    };
    const pushAdapter = {
      send: function (body, installations) {
        const promises = installations.map(device => {
          if (!device.deviceToken) {
            // Simulate error when device token is not set
            return Promise.reject();
          }
          return Promise.resolve({
            transmitted: true,
            device: device,
          });
        });

        return Promise.all(promises);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };
    const payload = {
      data: {
        alert: 'hello',
      },
      push_time: new Date().getTime() / 1000,
    };
    const installations = [];
    while (installations.length != 5) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    const config = Config.get(Parse.applicationId);
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, {}, config, auth);
    await pushCompleted(pushStatusId);
    const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
    expect(pushStatus.get('status')).toBe('succeeded');
  });

  it('should support localized payload data', async () => {
    const payload = {
      data: {
        alert: 'Hello!',
        'alert-fr': 'Bonjour',
        'alert-es': 'Ola',
      },
    };
    const pushAdapter = {
      send: function (body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };
    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    const where = {
      deviceType: 'ios',
    };
    const installations = [];
    while (installations.length != 5) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    installations[0].set('localeIdentifier', 'fr-CA');
    installations[1].set('localeIdentifier', 'fr-FR');
    installations[2].set('localeIdentifier', 'en-US');

    spyOn(pushAdapter, 'send').and.callThrough();
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    await Parse.Object.saveAll(installations);
    const pushStatusId = await sendPush(payload, where, config, auth);
    await pushCompleted(pushStatusId);

    expect(pushAdapter.send.calls.count()).toBe(2);
    const firstCall = pushAdapter.send.calls.first();
    expect(firstCall.args[0].data).toEqual({
      alert: 'Hello!',
    });
    expect(firstCall.args[1].length).toBe(3); // 3 installations

    const lastCall = pushAdapter.send.calls.mostRecent();
    expect(lastCall.args[0].data).toEqual({
      alert: 'Bonjour',
    });
    expect(lastCall.args[1].length).toBe(2); // 2 installations
    // No installation is in es so only 1 call for fr, and another for default
  });

  it('should update audiences', async () => {
    const pushAdapter = {
      send: function (body, installations) {
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes: function () {
        return ['ios'];
      },
    };

    const config = Config.get(Parse.applicationId);
    const auth = {
      isMaster: true,
    };
    let audienceId = null;
    const now = new Date();
    let timesUsed = 0;
    const where = {
      deviceType: 'ios',
    };
    const installations = [];
    while (installations.length != 5) {
      const installation = new Parse.Object('_Installation');
      installation.set('installationId', 'installation_' + installations.length);
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    spyOn(pushAdapter, 'send').and.callThrough();
    await reconfigureServer({
      push: { adapter: pushAdapter },
    });
    await Parse.Object.saveAll(installations);

    // Create an audience
    const query = new Parse.Query('_Audience');
    query.descending('createdAt');
    query.equalTo('query', JSON.stringify(where));
    const parseResults = results => {
      if (results.length > 0) {
        audienceId = results[0].id;
        timesUsed = results[0].get('timesUsed');
        if (!isFinite(timesUsed)) {
          timesUsed = 0;
        }
      }
    };
    const audience = new Parse.Object('_Audience');
    audience.set('name', 'testAudience');
    audience.set('query', JSON.stringify(where));
    await Parse.Object.saveAll(audience);
    await query.find({ useMasterKey: true }).then(parseResults);

    const body = {
      data: { alert: 'hello' },
      audience_id: audienceId,
    };
    const pushStatusId = await sendPush(body, where, config, auth);
    await pushCompleted(pushStatusId);
    expect(pushAdapter.send.calls.count()).toBe(1);
    const firstCall = pushAdapter.send.calls.first();
    expect(firstCall.args[0].data).toEqual({
      alert: 'hello',
    });
    expect(firstCall.args[1].length).toBe(5);

    // Get the audience we used above.
    const audienceQuery = new Parse.Query('_Audience');
    audienceQuery.equalTo('objectId', audienceId);
    const results = await audienceQuery.find({ useMasterKey: true });

    expect(results[0].get('query')).toBe(JSON.stringify(where));
    expect(results[0].get('timesUsed')).toBe(timesUsed + 1);
    expect(results[0].get('lastUsed')).not.toBeLessThan(now);
  });

  describe('pushTimeHasTimezoneComponent', () => {
    it('should be accurate', () => {
      expect(PushController.pushTimeHasTimezoneComponent('2017-09-06T17:14:01.048Z')).toBe(
        true,
        'UTC time'
      );
      expect(PushController.pushTimeHasTimezoneComponent('2007-04-05T12:30-02:00')).toBe(
        true,
        'Timezone offset'
      );
      expect(PushController.pushTimeHasTimezoneComponent('2007-04-05T12:30:00.000Z-02:00')).toBe(
        true,
        'Seconds + Milliseconds + Timezone offset'
      );

      expect(PushController.pushTimeHasTimezoneComponent('2017-09-06T17:14:01.048')).toBe(
        false,
        'No timezone'
      );
      expect(PushController.pushTimeHasTimezoneComponent('2017-09-06')).toBe(false, 'YY-MM-DD');
    });
  });

  describe('formatPushTime', () => {
    it('should format as ISO string', () => {
      expect(
        PushController.formatPushTime({
          date: new Date('2017-09-06T17:14:01.048Z'),
          isLocalTime: false,
        })
      ).toBe('2017-09-06T17:14:01.048Z', 'UTC time');
      expect(
        PushController.formatPushTime({
          date: new Date('2007-04-05T12:30-02:00'),
          isLocalTime: false,
        })
      ).toBe('2007-04-05T14:30:00.000Z', 'Timezone offset');

      const noTimezone = new Date('2017-09-06T17:14:01.048');
      let expectedHour = 17 + noTimezone.getTimezoneOffset() / 60;
      let day = '06';
      if (expectedHour >= 24) {
        expectedHour = expectedHour - 24;
        day = '07';
      }
      expect(
        PushController.formatPushTime({
          date: noTimezone,
          isLocalTime: true,
        })
      ).toBe(`2017-09-${day}T${expectedHour.toString().padStart(2, '0')}:14:01.048`, 'No timezone');
      expect(
        PushController.formatPushTime({
          date: new Date('2017-09-06'),
          isLocalTime: true,
        })
      ).toBe('2017-09-06T00:00:00.000', 'YY-MM-DD');
    });
  });

  describe('Scheduling pushes in local time', () => {
    it('should preserve the push time', async () => {
      const auth = { isMaster: true };
      const pushAdapter = {
        send(body, installations) {
          return successfulTransmissions(body, installations);
        },
        getValidPushTypes() {
          return ['ios'];
        },
      };
      const pushTime = '2017-09-06T17:14:01.048';
      let expectedHour = 17 + new Date(pushTime).getTimezoneOffset() / 60;
      let day = '06';
      if (expectedHour >= 24) {
        expectedHour = expectedHour - 24;
        day = '07';
      }
      const payload = {
        data: {
          alert: 'Hello World!',
          badge: 'Increment',
        },
        push_time: pushTime,
      };
      await reconfigureServer({
        push: { adapter: pushAdapter },
        scheduledPush: true,
      });
      const config = Config.get(Parse.applicationId);
      const pushStatusId = await sendPush(payload, {}, config, auth);
      const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
      expect(pushStatus.get('status')).toBe('scheduled');
      expect(pushStatus.get('pushTime')).toBe(
        `2017-09-${day}T${expectedHour.toString().padStart(2, '0')}:14:01.048`
      );
    });
  });

  describe('With expiration defined', () => {
    const auth = { isMaster: true };
    const pushController = new PushController();

    let config;

    const pushes = [];
    const pushAdapter = {
      send(body, installations) {
        pushes.push(body);
        return successfulTransmissions(body, installations);
      },
      getValidPushTypes() {
        return ['ios'];
      },
    };

    beforeEach(done => {
      reconfigureServer({
        push: { adapter: pushAdapter },
      })
        .then(() => {
          config = Config.get(Parse.applicationId);
        })
        .then(done, done.fail);
    });

    it('should throw if both expiration_time and expiration_interval are set', () => {
      expect(() =>
        pushController.sendPush(
          {
            expiration_time: '2017-09-25T13:21:20.841Z',
            expiration_interval: 1000,
          },
          {},
          config,
          auth
        )
      ).toThrow();
    });

    it('should throw on invalid expiration_interval', () => {
      expect(() =>
        pushController.sendPush(
          {
            expiration_interval: -1,
          },
          {},
          config,
          auth
        )
      ).toThrow();
      expect(() =>
        pushController.sendPush(
          {
            expiration_interval: '',
          },
          {},
          config,
          auth
        )
      ).toThrow();
      expect(() =>
        pushController.sendPush(
          {
            expiration_time: {},
          },
          {},
          config,
          auth
        )
      ).toThrow();
    });

    describe('For immediate pushes', () => {
      it('should transform the expiration_interval into an absolute time', async () => {
        const now = new Date('2017-09-25T13:30:10.452Z');
        const payload = {
          data: {
            alert: 'immediate push',
          },
          expiration_interval: 20 * 60, // twenty minutes
        };
        await reconfigureServer({
          push: { adapter: pushAdapter },
        });
        const pushStatusId = await sendPush(
          payload,
          {},
          Config.get(Parse.applicationId),
          auth,
          now
        );
        const pushStatus = await Parse.Push.getPushStatus(pushStatusId);
        expect(pushStatus.get('expiry')).toBeDefined('expiry must be set');
        expect(pushStatus.get('expiry')).toEqual(new Date('2017-09-25T13:50:10.452Z').valueOf());

        expect(pushStatus.get('expiration_interval')).toBeDefined(
          'expiration_interval must be defined'
        );
        expect(pushStatus.get('expiration_interval')).toBe(20 * 60);
      });
    });
  });
});
