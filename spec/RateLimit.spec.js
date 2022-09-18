describe('rate limit', () => {
  it('can limit cloud functions', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      silent: false,
      rateLimitOptions: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 1,
          message: 'Too many requests. Please try again later',
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can add global limit', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      silent: false,
      rateLimitOptions: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests. Please try again later',
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
    await expectAsync(new Parse.Object('Test').save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can limit cloud with validator', async () => {
    Parse.Cloud.define('test', () => 'Abc', {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests. Please try again later',
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can skip with masterKey', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      silent: false,
      rateLimitOptions: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 1,
          message: 'Too many requests. Please try again later',
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
      silent: false,
      rateLimitOptions: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 1,
          master: true,
          message: 'Too many requests. Please try again later',
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test', null, { useMasterKey: true });
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can limit saving objects', async () => {
    await reconfigureServer({
      silent: false,
      rateLimitOptions: [
        {
          path: '/classes/*',
          windowMs: 10000,
          max: 1,
          message: 'Too many requests. Please try again later',
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await expectAsync(obj.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can set method to post', async () => {
    await reconfigureServer({
      silent: false,
      rateLimitOptions: [
        {
          path: '/classes/*',
          windowMs: 10000,
          max: 1,
          method: 'POST',
          message: 'Too many requests. Please try again later',
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.save();
    const obj2 = new Parse.Object('Test');
    await expectAsync(obj2.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can use a validator for post', async () => {
    Parse.Cloud.beforeSave('Test', () => {}, {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests. Please try again later',
      },
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await expectAsync(obj.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can set method to get', async () => {
    await reconfigureServer({
      silent: false,
      rateLimitOptions: [
        {
          path: '/classes/Test',
          windowMs: 10000,
          max: 1,
          method: 'GET',
          message: 'Too many requests. Please try again later',
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.save();
    await new Parse.Query('Test').first();
    await expectAsync(new Parse.Query('Test').first()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can use a validator', async () => {
    Parse.Cloud.beforeFind('Test', () => {}, {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests. Please try again later',
      },
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.save();
    await new Parse.Query('Test').first();
    await expectAsync(new Parse.Query('Test').first()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
    await expectAsync(new Parse.Query('Test').get('abc')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can set method to delete', async () => {
    await reconfigureServer({
      silent: false,
      rateLimitOptions: [
        {
          path: '/classes/Test',
          windowMs: 10000,
          max: 1,
          method: 'DELETE',
          message: 'Too many requests. Please try again later',
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.destroy();
    await expectAsync(obj.destroy()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can set beforeDelete', async () => {
    Parse.Cloud.beforeDelete('Test', () => {}, {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests. Please try again later',
      },
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.destroy();
    await expectAsync(obj.destroy()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can set beforeLogin', async () => {
    Parse.Cloud.beforeLogin(() => {}, {
      rateLimit: {
        windowMs: 10000,
        max: 1,
        message: 'Too many requests. Please try again later',
      },
    });
    await Parse.User.signUp('myUser', 'password');
    await Parse.User.logIn('myUser', 'password');
    await expectAsync(Parse.User.logIn('myUser', 'password')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests. Please try again later')
    );
  });

  it('can define limits via rateLimitOptions and define', async () => {
    await reconfigureServer({
      silent: false,
      rateLimitOptions: [
        {
          path: '/functions/*',
          windowMs: 10000,
          max: 100,
          message: 'Too many requests. Please try again later',
        },
      ],
    });
    Parse.Cloud.define('test', () => 'Abc', {
      rateLimit: {
        windowMs: 10000,
        max: 1,
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests.')
    );
  });

  it('can validate rateLimitOptions', async () => {
    await expectAsync(reconfigureServer({ rateLimitOptions: 'a' })).toBeRejectedWith(
      'rateLimitOptions must be an array or object'
    );
    await expectAsync(reconfigureServer({ rateLimitOptions: ['a'] })).toBeRejectedWith(
      'rateLimitOptions must be an array of objects'
    );
    await expectAsync(reconfigureServer({ rateLimitOptions: [{ path: [] }] })).toBeRejectedWith(
      'rateLimitOptions.path must be a string'
    );
    await expectAsync(reconfigureServer({ rateLimitOptions: [{ windowMs: [] }] })).toBeRejectedWith(
      'rateLimitOptions.windowMs must be a number'
    );
    await expectAsync(reconfigureServer({ rateLimitOptions: [{ max: [] }] })).toBeRejectedWith(
      'rateLimitOptions.max must be a number'
    );
    await expectAsync(reconfigureServer({ rateLimitOptions: [{ message: [] }] })).toBeRejectedWith(
      'rateLimitOptions.message must be a string'
    );
  });
});
