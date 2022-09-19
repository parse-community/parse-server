describe('rate limit', () => {
  it('can limit cloud functions', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 1,
          message: 'Too many requests',
          restrictInternal: true,
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can add global limit', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests',
        restrictInternal: true,
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
    await expectAsync(new Parse.Object('Test').save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can limit cloud with validator', async () => {
    Parse.Cloud.define('test', () => 'Abc', {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests',
        restrictInternal: true,
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can skip with masterKey', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 1,
          message: 'Too many requests',
          restrictInternal: true,
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test', null, { useMasterKey: true });
    expect(response1).toBe('Abc');
    const response2 = await Parse.Cloud.run('test', null, { useMasterKey: true });
    expect(response2).toBe('Abc');
  });

  it('should run with masterKey', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 1,
          master: true,
          message: 'Too many requests',
          restrictInternal: true,
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test', null, { useMasterKey: true });
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can limit saving objects', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          path: '/classes/*',
          windowMs: 10000,
          max: 1,
          message: 'Too many requests',
          restrictInternal: true,
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await expectAsync(obj.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set method to post', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          path: '/classes/*',
          windowMs: 10000,
          max: 1,
          method: 'POST',
          message: 'Too many requests',
          restrictInternal: true,
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.save();
    const obj2 = new Parse.Object('Test');
    await expectAsync(obj2.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can use a validator for post', async () => {
    Parse.Cloud.beforeSave('Test', () => {}, {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests',
        restrictInternal: true,
      },
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await expectAsync(obj.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set method to get', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          path: '/classes/Test',
          windowMs: 10000,
          max: 1,
          method: 'GET',
          message: 'Too many requests',
          restrictInternal: true,
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.save();
    await new Parse.Query('Test').first();
    await expectAsync(new Parse.Query('Test').first()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can use a validator', async () => {
    Parse.Cloud.beforeFind('TestObject', () => {}, {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests',
        restrictInternal: true,
      },
    });
    const obj = new Parse.Object('TestObject');
    await obj.save();
    await obj.save();
    await new Parse.Query('TestObject').first();
    await expectAsync(new Parse.Query('TestObject').first()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
    await expectAsync(new Parse.Query('TestObject').get('abc')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set method to delete', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          path: '/classes/Test',
          windowMs: 10000,
          max: 1,
          method: 'DELETE',
          message: 'Too many requests',
          restrictInternal: true,
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.destroy();
    await expectAsync(obj.destroy()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set beforeDelete', async () => {
    Parse.Cloud.beforeDelete('TestDelete', () => {}, {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests',
        restrictInternal: true,
      },
    });
    const obj = new Parse.Object('TestDelete');
    await obj.save();
    await obj.destroy();
    await expectAsync(obj.destroy()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set beforeLogin', async () => {
    Parse.Cloud.beforeLogin(() => {}, {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests',
        restrictInternal: true,
      },
    });
    await Parse.User.signUp('myUser', 'password');
    await Parse.User.logIn('myUser', 'password');
    await expectAsync(Parse.User.logIn('myUser', 'password')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can define limits via rateLimit and define', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 100,
          message: 'Too many requests',
          restrictInternal: true,
        },
      ],
    });
    Parse.Cloud.define('test', () => 'Abc', {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        restrictInternal: true,
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests.')
    );
  });

  it('does not limit internal calls', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 1,
          message: 'Too many requests',
        },
      ],
    });
    Parse.Cloud.define('test1', () => 'Abc');
    Parse.Cloud.define('test2', async () => {
      await Parse.Cloud.run('test1');
      await Parse.Cloud.run('test1');
    });
    await Parse.Cloud.run('test2');
  });

  it('can validate rateLimit', async () => {
    await expectAsync(reconfigureServer({ rateLimit: 'a', windowMs: 1000, max: 3 })).toBeRejectedWith(
      'rateLimit must be an array or object'
    );
    await expectAsync(reconfigureServer({ rateLimit: ['a'] })).toBeRejectedWith(
      'rateLimit must be an array of objects'
    );
    await expectAsync(reconfigureServer({ rateLimit: [{ path: [] }] })).toBeRejectedWith(
      'rateLimit.path must be a string'
    );
    await expectAsync(reconfigureServer({ rateLimit: [{ windowMs: [] }] })).toBeRejectedWith(
      'rateLimit.windowMs must be a number'
    );
    await expectAsync(
      reconfigureServer({ rateLimit: [{ restrictInternal: [], windowMs: 1000, max: 3 }] })
    ).toBeRejectedWith('rateLimit.restrictInternal must be a boolean');
    await expectAsync(reconfigureServer({ rateLimit: [{ max: [], windowMs: 1000 }] })).toBeRejectedWith(
      'rateLimit.max must be a number'
    );
    await expectAsync(reconfigureServer({ rateLimit: [{ message: [], windowMs: 1000, max: 3 }] })).toBeRejectedWith(
      'rateLimit.message must be a string'
    );
    await expectAsync(reconfigureServer({ rateLimit: [{ max: 3 }] })).toBeRejectedWith(
      'rateLimit.windowMs must be defined'
    );
    await expectAsync(reconfigureServer({ rateLimit: [{ windowMs: 3 }] })).toBeRejectedWith(
      'rateLimit.max must be defined'
    );
  });
});
