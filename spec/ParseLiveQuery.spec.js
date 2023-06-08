'use strict';
const Auth = require('../lib/Auth');
const UserController = require('../lib/Controllers/UserController').UserController;
const Config = require('../lib/Config');
const ParseServer = require('../lib/index').ParseServer;
const triggers = require('../lib/triggers');
const validatorFail = () => {
  throw 'you are not authorized';
};

describe('ParseLiveQuery', function () {
  beforeEach(() => {
    Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
  });
  afterEach(async () => {
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.close();
    // Wait for live query client to disconnect
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
  it('access user on onLiveQueryEvent disconnect', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const requestedUser = new Parse.User();
    requestedUser.setUsername('username');
    requestedUser.setPassword('password');
    Parse.Cloud.onLiveQueryEvent(req => {
      const { event, sessionToken } = req;
      if (event === 'ws_disconnect') {
        Parse.Cloud._removeAllHooks();
        expect(sessionToken).toBeDefined();
        expect(sessionToken).toBe(requestedUser.getSessionToken());
        done();
      }
    });
    await requestedUser.signUp();
    const query = new Parse.Query(TestObject);
    await query.subscribe();
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.close();
  });

  it('can subscribe to query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can use patterns in className', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['Test.*'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('expect afterEvent create', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('create');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
    });

    const query = new Parse.Query(TestObject);
    const subscription = await query.subscribe();
    subscription.on('create', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();
  });

  it('expect afterEvent payload', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('update');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
      expect(req.original.get('foo')).toBeUndefined();
      done();
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await query.subscribe();
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('expect afterEvent enter', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('enter');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
      expect(req.original.get('foo')).toBeUndefined();
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();
    subscription.on('enter', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    object.set('foo', 'bar');
    await object.save();
  });

  it('expect afterEvent leave', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('leave');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBeUndefined();
      expect(req.original.get('foo')).toBe('bar');
    });

    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();
    subscription.on('leave', object => {
      expect(object.get('foo')).toBeUndefined();
      done();
    });

    object.unset('foo');
    await object.save();
  });

  it('expect afterEvent delete', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('delete');
      expect(req.user).toBeUndefined();
      req.object.set('foo', 'bar');
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);

    const subscription = await query.subscribe();
    subscription.on('delete', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    await object.destroy();
  });

  it('can handle afterEvent modification', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      const current = req.object;
      current.set('foo', 'yolo');

      const original = req.original;
      original.set('yolo', 'foo');
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', (object, original) => {
      expect(object.get('foo')).toBe('yolo');
      expect(original.get('yolo')).toBe('foo');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can return different object in afterEvent', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      const object = new Parse.Object('Yolo');
      req.object = object;
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.className).toBe('Yolo');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle afterEvent throw', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', () => {
      throw 'Throw error from LQ afterEvent.';
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', () => {
      fail('update should not have been called.');
    });
    subscription.on('error', e => {
      expect(e).toBe('Throw error from LQ afterEvent.');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can log on afterLiveQueryEvent throw', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    const logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});

    let session = undefined;
    Parse.Cloud.afterLiveQueryEvent('TestObject', ({ sessionToken }) => {
      session = sessionToken;
      /* eslint-disable no-undef */
      foo.bar();
      /* eslint-enable no-undef */
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    object.set({ foo: 'bar' });
    await object.save();
    await new Promise(resolve => subscription.on('error', resolve));
    expect(logger.error).toHaveBeenCalledWith(
      `Failed running afterLiveQueryEvent on class TestObject for event update with session ${session} with:\n Error: {"message":"foo is not defined","code":141}`
    );
  });

  it('can handle afterEvent sendEvent to false', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      const current = req.object;
      const original = req.original;

      setTimeout(() => {
        done();
      }, 2000);

      if (current.get('foo') != original.get('foo')) {
        req.sendEvent = false;
      }
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', () => {
      fail('update should not have been called.');
    });
    subscription.on('error', () => {
      fail('error should not have been called.');
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  xit('can handle live query with fields - enable upon JS SDK support', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['Test'],
      },
      startLiveQueryServer: true,
    });
    const query = new Parse.Query('Test');
    query.watch('yolo');
    const subscription = await query.subscribe();
    const spy = {
      create(obj) {
        if (!obj.get('yolo')) {
          fail('create should not have been called');
        }
      },
      update(object, original) {
        if (object.get('yolo') === original.get('yolo')) {
          fail('create should not have been called');
        }
      },
    };
    const createSpy = spyOn(spy, 'create').and.callThrough();
    const updateSpy = spyOn(spy, 'update').and.callThrough();
    subscription.on('create', spy.create);
    subscription.on('update', spy.update);
    const obj = new Parse.Object('Test');
    obj.set('foo', 'bar');
    await obj.save();
    obj.set('foo', 'xyz');
    obj.set('yolo', 'xyz');
    await obj.save();
    const obj2 = new Parse.Object('Test');
    obj2.set('foo', 'bar');
    obj2.set('yolo', 'bar');
    await obj2.save();
    obj2.set('foo', 'bart');
    await obj2.save();
    await new Promise(resolve => setTimeout(resolve, 2000));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('can handle afterEvent set pointers', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    const secondObject = new Parse.Object('Test2');
    secondObject.set('foo', 'bar');
    await secondObject.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', async ({ object }) => {
      const query = new Parse.Query('Test2');
      const obj = await query.first();
      object.set('obj', obj);
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('obj')).toBeDefined();
      expect(object.get('obj').get('foo')).toBe('bar');
      done();
    });
    subscription.on('error', () => {
      fail('error should not have been called.');
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle async afterEvent modification', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const parent = new TestObject();
    const child = new TestObject();
    child.set('bar', 'foo');
    await Parse.Object.saveAll([parent, child]);

    Parse.Cloud.afterLiveQueryEvent('TestObject', async req => {
      const current = req.object;
      const pointer = current.get('child');
      await pointer.fetch();
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', parent.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('child')).toBeDefined();
      expect(object.get('child').get('bar')).toBe('foo');
      done();
    });
    parent.set('child', child);
    await parent.save();
  });

  it('can handle beforeConnect / beforeSubscribe hooks', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
    });
    const object = new TestObject();
    await object.save();
    const hooks = {
      beforeSubscribe(req) {
        expect(req.op).toBe('subscribe');
        expect(req.requestId).toBe(1);
        expect(req.query).toBeDefined();
        expect(req.user).toBeUndefined();
      },
      beforeConnect(req) {
        expect(req.event).toBe('connect');
        expect(req.clients).toBe(0);
        expect(req.subscriptions).toBe(0);
        expect(req.useMasterKey).toBe(false);
        expect(req.installationId).toBeDefined();
        expect(req.user).toBeUndefined();
        expect(req.client).toBeDefined();
      },
    };
    spyOn(hooks, 'beforeSubscribe').and.callThrough();
    spyOn(hooks, 'beforeConnect').and.callThrough();
    Parse.Cloud.beforeSubscribe('TestObject', hooks.beforeSubscribe);
    Parse.Cloud.beforeConnect(hooks.beforeConnect);
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('foo')).toBe('bar');
      expect(hooks.beforeConnect).toHaveBeenCalled();
      expect(hooks.beforeSubscribe).toHaveBeenCalled();
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle beforeConnect validation function', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
    });

    const object = new TestObject();
    await object.save();
    Parse.Cloud.beforeConnect(() => {}, validatorFail);
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await expectAsync(query.subscribe()).toBeRejectedWith(
      new Parse.Error(Parse.Error.VALIDATION_ERROR, 'you are not authorized')
    );
  });

  it('can handle beforeSubscribe validation function', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeSubscribe(TestObject, () => {}, validatorFail);
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await expectAsync(query.subscribe()).toBeRejectedWith(
      new Parse.Error(Parse.Error.VALIDATION_ERROR, 'you are not authorized')
    );
  });

  it('can handle afterEvent validation function', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', () => {}, validatorFail);

    const query = new Parse.Query(TestObject);
    const subscription = await query.subscribe();
    subscription.on('error', error => {
      expect(error).toBe('you are not authorized');
      done();
    });

    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();
  });

  it('can handle beforeConnect error', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeConnect(() => {
      throw new Error('You shall not pass!');
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await expectAsync(query.subscribe()).toBeRejectedWith(new Error('You shall not pass!'));
  });

  it('can log on beforeConnect throw', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
    });

    const logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});
    let token = undefined;
    Parse.Cloud.beforeConnect(({ sessionToken }) => {
      token = sessionToken;
      /* eslint-disable no-undef */
      foo.bar();
      /* eslint-enable no-undef */
    });
    await expectAsync(new Parse.Query(TestObject).subscribe()).toBeRejectedWith(
      new Error('foo is not defined')
    );
    expect(logger.error).toHaveBeenCalledWith(
      `Failed running beforeConnect for session ${token} with:\n Error: {"message":"foo is not defined","code":141}`
    );
  });

  it('can handle beforeSubscribe error', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeSubscribe(TestObject, () => {
      throw new Error('You shall not subscribe!');
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await expectAsync(query.subscribe()).toBeRejectedWith(new Error('You shall not subscribe!'));
  });

  it('can log on beforeSubscribe error', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
    });

    const logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});

    Parse.Cloud.beforeSubscribe(TestObject, () => {
      /* eslint-disable no-undef */
      foo.bar();
      /* eslint-enable no-undef */
    });

    const query = new Parse.Query(TestObject);
    await expectAsync(query.subscribe()).toBeRejectedWith(new Error('foo is not defined'));

    expect(logger.error).toHaveBeenCalledWith(
      `Failed running beforeSubscribe on TestObject for session undefined with:\n Error: {"message":"foo is not defined","code":141}`
    );
  });

  it('can handle mutate beforeSubscribe query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
    });
    const hook = {
      beforeSubscribe(request) {
        request.query.equalTo('yolo', 'abc');
      },
    };
    spyOn(hook, 'beforeSubscribe').and.callThrough();
    Parse.Cloud.beforeSubscribe('TestObject', hook.beforeSubscribe);
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query('TestObject');
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', () => {
      fail('beforeSubscribe should restrict subscription');
    });
    subscription.on('enter', object => {
      if (object.get('yolo') === 'abc') {
        done();
      } else {
        fail('beforeSubscribe should restrict queries');
      }
    });
    object.set({ yolo: 'bar' });
    await object.save();
    object.set({ yolo: 'abc' });
    await object.save();
    expect(hook.beforeSubscribe).toHaveBeenCalled();
  });

  it('can return a new beforeSubscribe query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.beforeSubscribe(TestObject, request => {
      const query = new Parse.Query(TestObject);
      query.equalTo('foo', 'yolo');
      request.query = query;
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();

    subscription.on('create', object => {
      expect(object.get('foo')).toBe('yolo');
      done();
    });
    const object = new TestObject();
    object.set({ foo: 'yolo' });
    await object.save();
  });

  it('can handle select beforeSubscribe query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.beforeSubscribe(TestObject, request => {
      const query = request.query;
      query.select('yolo');
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();

    subscription.on('update', object => {
      expect(object.get('foo')).toBeUndefined();
      expect(object.get('yolo')).toBe('abc');
      done();
    });
    object.set({ foo: 'bar', yolo: 'abc' });
    await object.save();
  });

  it('LiveQuery with ACL', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['Chat'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const user = new Parse.User();
    user.setUsername('username');
    user.setPassword('password');
    await user.signUp();

    const calls = {
      beforeConnect(req) {
        expect(req.event).toBe('connect');
        expect(req.clients).toBe(0);
        expect(req.subscriptions).toBe(0);
        expect(req.useMasterKey).toBe(false);
        expect(req.installationId).toBeDefined();
        expect(req.client).toBeDefined();
      },
      beforeSubscribe(req) {
        expect(req.op).toBe('subscribe');
        expect(req.requestId).toBe(1);
        expect(req.query).toBeDefined();
        expect(req.user).toBeDefined();
      },
      afterLiveQueryEvent(req) {
        expect(req.user).toBeDefined();
        expect(req.object.get('foo')).toBe('bar');
      },
      create(object) {
        expect(object.get('foo')).toBe('bar');
      },
      delete(object) {
        expect(object.get('foo')).toBe('bar');
      },
    };
    for (const key in calls) {
      spyOn(calls, key).and.callThrough();
    }
    Parse.Cloud.beforeConnect(calls.beforeConnect);
    Parse.Cloud.beforeSubscribe('Chat', calls.beforeSubscribe);
    Parse.Cloud.afterLiveQueryEvent('Chat', calls.afterLiveQueryEvent);

    const chatQuery = new Parse.Query('Chat');
    const subscription = await chatQuery.subscribe();
    subscription.on('create', calls.create);
    subscription.on('delete', calls.delete);
    const object = new Parse.Object('Chat');
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    object.set({ foo: 'bar' });
    await object.save();
    await object.destroy();
    await new Promise(resolve => setTimeout(resolve, 200));
    for (const key in calls) {
      expect(calls[key]).toHaveBeenCalled();
    }
  });

  it('LiveQuery should work with changing role', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['Chat'],
      },
      startLiveQueryServer: true,
    });
    const user = new Parse.User();
    user.setUsername('username');
    user.setPassword('password');
    await user.signUp();

    const role = new Parse.Role('Test', new Parse.ACL(user));
    await role.save();

    const chatQuery = new Parse.Query('Chat');
    const subscription = await chatQuery.subscribe();
    subscription.on('create', () => {
      fail('should not call create as user is not part of role.');
    });

    const object = new Parse.Object('Chat');
    const acl = new Parse.ACL();
    acl.setRoleReadAccess(role, true);
    object.setACL(acl);
    object.set({ foo: 'bar' });
    await object.save(null, { useMasterKey: true });
    role.getUsers().add(user);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await role.save();
    await new Promise(resolve => setTimeout(resolve, 1000));
    object.set('foo', 'yolo');
    await Promise.all([
      new Promise(resolve => {
        subscription.on('update', obj => {
          expect(obj.get('foo')).toBe('yolo');
          expect(obj.getACL().toJSON()).toEqual({ 'role:Test': { read: true } });
          resolve();
        });
      }),
      object.save(null, { useMasterKey: true }),
    ]);
  });

  it('liveQuery on Session class', async done => {
    await reconfigureServer({
      liveQuery: { classNames: [Parse.Session] },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const user = new Parse.User();
    user.setUsername('username');
    user.setPassword('password');
    await user.signUp();

    const query = new Parse.Query(Parse.Session);
    const subscription = await query.subscribe();

    subscription.on('create', async obj => {
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(obj.get('user').id).toBe(user.id);
      expect(obj.get('createdWith')).toEqual({ action: 'login', authProvider: 'password' });
      expect(obj.get('expiresAt')).toBeInstanceOf(Date);
      expect(obj.get('installationId')).toBeDefined();
      expect(obj.get('createdAt')).toBeInstanceOf(Date);
      expect(obj.get('updatedAt')).toBeInstanceOf(Date);
      done();
    });

    await Parse.User.logIn('username', 'password');
  });

  it('prevent liveQuery on Session class when not logged in', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: [Parse.Session],
      },
      startLiveQueryServer: true,
    });
    const query = new Parse.Query(Parse.Session);
    await expectAsync(query.subscribe()).toBeRejectedWith(new Error('Invalid session token'));
  });

  it('handle invalid websocket payload length', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
      websocketTimeout: 100,
    });
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();

    // All control frames must have a payload length of 125 bytes or less.
    // https://tools.ietf.org/html/rfc6455#section-5.5
    //
    // 0x89 = 10001001 = ping
    // 0xfe = 11111110 = first bit is masking the remaining 7 are 1111110 or 126 the payload length
    // https://tools.ietf.org/html/rfc6455#section-5.2
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.socket._socket.write(Buffer.from([0x89, 0xfe]));

    subscription.on('update', async object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    // Wait for Websocket timeout to reconnect
    setTimeout(async () => {
      object.set({ foo: 'bar' });
      await object.save();
    }, 1000);
  });

  it('should execute live query update on email validation', async done => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };

    await reconfigureServer({
      maintenanceKey: 'test2',
      liveQuery: {
        classNames: [Parse.User],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
      websocketTimeout: 100,
      appName: 'liveQueryEmailValidation',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 20, // 0.5 second
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      const user = new Parse.User();
      user.set('password', 'asdf');
      user.set('email', 'asdf@example.com');
      user.set('username', 'zxcv');
      user
        .signUp()
        .then(() => {
          const config = Config.get('test');
          return config.database.find(
            '_User',
            {
              username: 'zxcv',
            },
            {},
            Auth.maintenance(config)
          );
        })
        .then(async results => {
          const foundUser = results[0];
          const query = new Parse.Query('_User');
          query.equalTo('objectId', foundUser.objectId);
          const subscription = await query.subscribe();

          subscription.on('update', async object => {
            expect(object).toBeDefined();
            expect(object.get('emailVerified')).toBe(true);
            done();
          });

          const userController = new UserController(emailAdapter, 'test', {
            verifyUserEmails: true,
          });
          userController.verifyEmail(foundUser.username, foundUser._email_verify_token);
        });
    });
  });

  it('should not broadcast event to client with invalid session token - avisory GHSA-2xm2-xj2q-qgpj', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      liveQueryServerOptions: {
        cacheTimeout: 100,
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
      cacheTTL: 100,
    });
    const user = new Parse.User();
    user.setUsername('username');
    user.setPassword('password');
    await user.signUp();
    const obj1 = new Parse.Object('TestObject');
    const obj1ACL = new Parse.ACL();
    obj1ACL.setPublicReadAccess(false);
    obj1ACL.setReadAccess(user, true);
    obj1.setACL(obj1ACL);
    const obj2 = new Parse.Object('TestObject');
    const obj2ACL = new Parse.ACL();
    obj2ACL.setPublicReadAccess(false);
    obj2ACL.setReadAccess(user, true);
    obj2.setACL(obj2ACL);
    const query = new Parse.Query('TestObject');
    const subscription = await query.subscribe();
    subscription.on('create', obj => {
      if (obj.id !== obj1.id) {
        done.fail('should not fire');
      }
    });
    await obj1.save();
    await Parse.User.logOut();
    await new Promise(resolve => setTimeout(resolve, 200));
    await obj2.save();
    await new Promise(resolve => setTimeout(resolve, 200));
    done();
  });

  it('should strip out session token in LiveQuery', async () => {
    await reconfigureServer({
      liveQuery: { classNames: ['_User'] },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const user = new Parse.User();
    user.setUsername('username');
    user.setPassword('password');
    user.set('foo', 'bar');
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    user.setACL(acl);

    const query = new Parse.Query(Parse.User);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();

    const events = ['create', 'update', 'enter', 'leave', 'delete'];
    const response = (obj, prev) => {
      expect(obj.get('sessionToken')).toBeUndefined();
      expect(obj.sessionToken).toBeUndefined();
      expect(prev && prev.sessionToken).toBeUndefined();
      if (prev && prev.get) {
        expect(prev.get('sessionToken')).toBeUndefined();
      }
    };
    const calls = {};
    for (const key of events) {
      calls[key] = response;
      spyOn(calls, key).and.callThrough();
      subscription.on(key, calls[key]);
    }
    await user.signUp();
    user.unset('foo');
    await user.save();
    user.set('foo', 'bar');
    await user.save();
    user.set('yolo', 'bar');
    await user.save();
    await user.destroy();
    await new Promise(resolve => setTimeout(resolve, 10));
    for (const key of events) {
      expect(calls[key]).toHaveBeenCalled();
    }
  });

  it('should strip out protected fields', async () => {
    await reconfigureServer({
      liveQuery: { classNames: ['Test'] },
      startLiveQueryServer: true,
    });
    const obj1 = new Parse.Object('Test');
    obj1.set('foo', 'foo');
    obj1.set('bar', 'bar');
    obj1.set('qux', 'qux');
    await obj1.save();
    const config = Config.get(Parse.applicationId);
    const schemaController = await config.database.loadSchema();
    await schemaController.updateClass(
      'Test',
      {},
      {
        get: { '*': true },
        find: { '*': true },
        update: { '*': true },
        protectedFields: {
          '*': ['foo'],
        },
      }
    );
    const object = await obj1.fetch();
    expect(object.get('foo')).toBe(undefined);
    expect(object.get('bar')).toBeDefined();
    expect(object.get('qux')).toBeDefined();

    const subscription = await new Parse.Query('Test').subscribe();
    await Promise.all([
      new Promise(resolve => {
        subscription.on('update', (obj, original) => {
          expect(obj.get('foo')).toBe(undefined);
          expect(obj.get('bar')).toBeDefined();
          expect(obj.get('qux')).toBeDefined();
          expect(original.get('foo')).toBe(undefined);
          expect(original.get('bar')).toBeDefined();
          expect(original.get('qux')).toBeDefined();
          resolve();
        });
      }),
      obj1.save({ foo: 'abc' }),
    ]);
  });

  it('can subscribe to query and return object with withinKilometers with last parameter on update', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    const firstPoint = new Parse.GeoPoint({ latitude: 40.0, longitude: -30.0 });
    object.set({ location: firstPoint });
    await object.save();

    // unsorted will use $centerSphere operator
    const sorted = false;
    const query = new Parse.Query(TestObject);
    query.withinKilometers(
      'location',
      new Parse.GeoPoint({ latitude: 40.0, longitude: -30.0 }),
      2,
      sorted
    );
    const subscription = await query.subscribe();
    subscription.on('update', obj => {
      expect(obj.id).toBe(object.id);
      done();
    });

    const secondPoint = new Parse.GeoPoint({ latitude: 40.0, longitude: -30.0 });
    object.set({ location: secondPoint });
    await object.save();
  });

  it('does shutdown liveQuery server', async () => {
    await reconfigureServer({ appId: 'test_app_id' });
    const config = {
      appId: 'hello_test',
      masterKey: 'world',
      port: 1345,
      mountPath: '/1',
      serverURL: 'http://localhost:1345/1',
      liveQuery: {
        classNames: ['Yolo'],
      },
      startLiveQueryServer: true,
    };
    if (process.env.PARSE_SERVER_TEST_DB === 'postgres') {
      config.databaseAdapter = new databaseAdapter.constructor({
        uri: databaseURI,
        collectionPrefix: 'test_',
      });
      config.filesAdapter = defaultConfiguration.filesAdapter;
    }
    const server = await ParseServer.startApp(config);
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.serverURL = 'ws://localhost:1345/1';
    const query = await new Parse.Query('Yolo').subscribe();
    await Promise.all([
      server.handleShutdown(),
      new Promise(resolve => query.on('close', resolve)),
    ]);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(server.liveQueryServer.server.address()).toBeNull();
    expect(server.liveQueryServer.subscriber.isOpen).toBeFalse();
    await new Promise(resolve => server.server.close(resolve));
  });

  it('prevent afterSave trigger if not exists', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    spyOn(triggers, 'maybeRunTrigger').and.callThrough();
    const object1 = new TestObject();
    const object2 = new TestObject();
    const object3 = new TestObject();
    await Parse.Object.saveAll([object1, object2, object3]);

    expect(triggers.maybeRunTrigger).toHaveBeenCalledTimes(0);
    expect(object1.id).toBeDefined();
    expect(object2.id).toBeDefined();
    expect(object3.id).toBeDefined();
  });
});
