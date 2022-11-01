const request = require('../lib/request');
const Auth = require('../lib/Auth');
const requestWithExpectedError = async params => {
  try {
    return await request(params);
  } catch (e) {
    throw new Error(e.data.error);
  }
};
describe('Auth Adapter features', () => {
  const baseAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
  };
  const baseAdapter2 = {
    validateAppId: appIds => (appIds[0] === 'test' ? Promise.resolve() : Promise.reject()),
    validateAuthData: () => Promise.resolve(),
    appIds: ['test'],
    options: { anOption: true },
  };

  const doNotSaveAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve({ doNotSave: true }),
  };

  const additionalAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
    policy: 'additional',
  };

  const soloAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
    policy: 'solo',
  };

  const challengeAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
    challenge: () => Promise.resolve({ token: 'test' }),
    options: {
      anOption: true,
    },
  };

  const modernAdapter = {
    validateAppId: () => Promise.resolve(),
    validateSetUp: () => Promise.resolve(),
    validateUpdate: () => Promise.resolve(),
    validateLogin: () => Promise.resolve(),
  };

  const modernAdapter2 = {
    validateAppId: () => Promise.resolve(),
    validateSetUp: () => Promise.resolve(),
    validateUpdate: () => Promise.resolve(),
    validateLogin: () => Promise.resolve(),
  };

  const wrongAdapter = {
    validateAppId: () => Promise.resolve(),
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-REST-API-Key': 'rest',
  };

  it('should ensure no duplicate auth data id after before save', async () => {
    await reconfigureServer({
      auth: { baseAdapter },
      cloud: () => {
        Parse.Cloud.beforeSave('_User', async request => {
          request.object.set('authData', { baseAdapter: { id: 'test' } });
        });
      },
    });

    const user = new Parse.User();
    await user.save({ authData: { baseAdapter: { id: 'another' } } });
    await user.fetch({ useMasterKey: true });
    expect(user.get('authData')).toEqual({ baseAdapter: { id: 'test' } });

    const user2 = new Parse.User();
    await expectAsync(
      user2.save({ authData: { baseAdapter: { id: 'another' } } })
    ).toBeRejectedWithError('this auth is already used');
  });

  it('should ensure no duplicate auth data id after before save in case of more than one result', async () => {
    await reconfigureServer({
      auth: { baseAdapter },
      cloud: () => {
        Parse.Cloud.beforeSave('_User', async request => {
          request.object.set('authData', { baseAdapter: { id: 'test' } });
        });
      },
    });

    const user = new Parse.User();
    await user.save({ authData: { baseAdapter: { id: 'another' } } });
    await user.fetch({ useMasterKey: true });
    expect(user.get('authData')).toEqual({ baseAdapter: { id: 'test' } });

    let i = 0;
    const originalFn = Auth.findUsersWithAuthData;
    spyOn(Auth, 'findUsersWithAuthData').and.callFake((...params) => {
      // First call is triggered during authData validation
      if (i === 0) {
        i++;
        return originalFn(...params);
      }
      // Second call is triggered after beforeSave. A developer can modify authData during beforeSave.
      // To perform a determinist login, the uniqueness of `auth.id` needs to be ensured.
      // A developer with a direct access to the database could break something and duplicate authData.id.
      // In this case, if 2 matching users are detected for a single authData.id, then the login/register will be canceled.
      // Promise.resolve([true, true]) simulates this case with 2 matching users.
      return Promise.resolve([true, true]);
    });
    const user2 = new Parse.User();
    await expectAsync(
      user2.save({ authData: { baseAdapter: { id: 'another' } } })
    ).toBeRejectedWithError('this auth is already used');
  });

  it('should ensure no duplicate auth data id during authData validation in case of more than one result', async () => {
    await reconfigureServer({
      auth: { baseAdapter },
      cloud: () => {
        Parse.Cloud.beforeSave('_User', async request => {
          request.object.set('authData', { baseAdapter: { id: 'test' } });
        });
      },
    });

    spyOn(Auth, 'findUsersWithAuthData').and.resolveTo([true, true]);

    const user = new Parse.User();
    await expectAsync(
      user.save({ authData: { baseAdapter: { id: 'another' } } })
    ).toBeRejectedWithError('this auth is already used');
  });

  it('should pass authData, options, request to validateAuthData', async () => {
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({});
    await reconfigureServer({ auth: { baseAdapter } });
    const user = new Parse.User();
    const payload = { someData: true };

    await user.save({
      username: 'test',
      password: 'password',
      authData: { baseAdapter: payload },
    });

    expect(user.getSessionToken()).toBeDefined();
    const firstCall = baseAdapter.validateAuthData.calls.argsFor(0);
    expect(firstCall[0]).toEqual(payload);
    expect(firstCall[1]).toEqual(baseAdapter);
    expect(firstCall[2].object).toBeDefined();
    expect(firstCall[2].original).toBeUndefined();
    expect(firstCall[2].user).toBeUndefined();
    expect(firstCall[2].isChallenge).toBeUndefined();
    expect(firstCall.length).toEqual(3);

    await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      body: JSON.stringify({
        username: 'test',
        password: 'password',
        authData: { baseAdapter: payload },
      }),
    });
    const secondCall = baseAdapter.validateAuthData.calls.argsFor(1);
    expect(secondCall[0]).toEqual(payload);
    expect(secondCall[1]).toEqual(baseAdapter);
    expect(secondCall[2].original).toBeDefined();
    expect(secondCall[2].original instanceof Parse.User).toBeTruthy();
    expect(secondCall[2].original.id).toEqual(user.id);
    expect(secondCall[2].object).toBeDefined();
    expect(secondCall[2].object instanceof Parse.User).toBeTruthy();
    expect(secondCall[2].object.id).toEqual(user.id);
    expect(secondCall[2].isChallenge).toBeUndefined();
    expect(secondCall[2].user).toBeUndefined();
    expect(secondCall.length).toEqual(3);
  });

  it('should trigger correctly validateSetUp', async () => {
    spyOn(modernAdapter, 'validateSetUp').and.resolveTo({});
    spyOn(modernAdapter, 'validateUpdate').and.resolveTo({});
    spyOn(modernAdapter, 'validateLogin').and.resolveTo({});
    spyOn(modernAdapter2, 'validateSetUp').and.resolveTo({});
    spyOn(modernAdapter2, 'validateUpdate').and.resolveTo({});
    spyOn(modernAdapter2, 'validateLogin').and.resolveTo({});

    await reconfigureServer({ auth: { modernAdapter, modernAdapter2 } });
    const user = new Parse.User();

    await user.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });

    expect(modernAdapter.validateUpdate).toHaveBeenCalledTimes(0);
    expect(modernAdapter.validateLogin).toHaveBeenCalledTimes(0);
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    const call = modernAdapter.validateSetUp.calls.argsFor(0);
    expect(call[0]).toEqual({ id: 'modernAdapter' });
    expect(call[1]).toEqual(modernAdapter);
    expect(call[2].isChallenge).toBeUndefined();
    expect(call[2].master).toBeDefined();
    expect(call[2].object instanceof Parse.User).toBeTruthy();
    expect(call[2].user).toBeUndefined();
    expect(call[2].original).toBeUndefined();
    expect(call[2].triggerName).toBe('validateSetUp');
    expect(call.length).toEqual(3);
    expect(user.getSessionToken()).toBeDefined();

    await user.save(
      { authData: { modernAdapter2: { id: 'modernAdapter2' } } },
      { sessionToken: user.getSessionToken() }
    );

    expect(modernAdapter2.validateUpdate).toHaveBeenCalledTimes(0);
    expect(modernAdapter2.validateLogin).toHaveBeenCalledTimes(0);
    expect(modernAdapter2.validateSetUp).toHaveBeenCalledTimes(1);
    const call2 = modernAdapter2.validateSetUp.calls.argsFor(0);
    expect(call2[0]).toEqual({ id: 'modernAdapter2' });
    expect(call2[1]).toEqual(modernAdapter2);
    expect(call2[2].isChallenge).toBeUndefined();
    expect(call2[2].master).toBeDefined();
    expect(call2[2].object instanceof Parse.User).toBeTruthy();
    expect(call2[2].original instanceof Parse.User).toBeTruthy();
    expect(call2[2].user instanceof Parse.User).toBeTruthy();
    expect(call2[2].original.id).toEqual(call2[2].object.id);
    expect(call2[2].user.id).toEqual(call2[2].object.id);
    expect(call2[2].object.id).toEqual(user.id);
    expect(call2[2].triggerName).toBe('validateSetUp');
    expect(call2.length).toEqual(3);

    const user2 = new Parse.User();
    user2.id = user.id;
    await user2.fetch({ useMasterKey: true });
    expect(user2.get('authData')).toEqual({
      modernAdapter: { id: 'modernAdapter' },
      modernAdapter2: { id: 'modernAdapter2' },
    });
  });

  it('should trigger correctly validateLogin', async () => {
    spyOn(modernAdapter, 'validateSetUp').and.resolveTo({});
    spyOn(modernAdapter, 'validateUpdate').and.resolveTo({});
    spyOn(modernAdapter, 'validateLogin').and.resolveTo({});

    await reconfigureServer({ auth: { modernAdapter }, allowExpiredAuthDataToken: false });
    const user = new Parse.User();

    await user.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });

    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    const user2 = new Parse.User();
    await user2.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });

    expect(modernAdapter.validateUpdate).toHaveBeenCalledTimes(0);
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    expect(modernAdapter.validateLogin).toHaveBeenCalledTimes(1);
    const call = modernAdapter.validateLogin.calls.argsFor(0);
    expect(call[0]).toEqual({ id: 'modernAdapter' });
    expect(call[1]).toEqual(modernAdapter);
    expect(call[2].object instanceof Parse.User).toBeTruthy();
    expect(call[2].original instanceof Parse.User).toBeTruthy();
    expect(call[2].isChallenge).toBeUndefined();
    expect(call[2].master).toBeDefined();
    expect(call[2].user).toBeUndefined();
    expect(call[2].original.id).toEqual(user2.id);
    expect(call[2].object.id).toEqual(user2.id);
    expect(call[2].object.id).toEqual(user.id);
    expect(call.length).toEqual(3);
    expect(user2.getSessionToken()).toBeDefined();
  });

  it('should trigger correctly validateUpdate', async () => {
    spyOn(modernAdapter, 'validateSetUp').and.resolveTo({});
    spyOn(modernAdapter, 'validateUpdate').and.resolveTo({});
    spyOn(modernAdapter, 'validateLogin').and.resolveTo({});

    await reconfigureServer({ auth: { modernAdapter } });
    const user = new Parse.User();

    await user.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);

    // Save same data
    await user.save(
      { authData: { modernAdapter: { id: 'modernAdapter' } } },
      { sessionToken: user.getSessionToken() }
    );

    // Save same data with master key
    await user.save(
      { authData: { modernAdapter: { id: 'modernAdapter' } } },
      { useMasterKey: true }
    );

    expect(modernAdapter.validateUpdate).toHaveBeenCalledTimes(0);
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    expect(modernAdapter.validateLogin).toHaveBeenCalledTimes(0);

    // Change authData
    await user.save(
      { authData: { modernAdapter: { id: 'modernAdapter2' } } },
      { sessionToken: user.getSessionToken() }
    );

    expect(modernAdapter.validateUpdate).toHaveBeenCalledTimes(1);
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    expect(modernAdapter.validateLogin).toHaveBeenCalledTimes(0);
    const call = modernAdapter.validateUpdate.calls.argsFor(0);
    expect(call[0]).toEqual({ id: 'modernAdapter2' });
    expect(call[1]).toEqual(modernAdapter);
    expect(call[2].isChallenge).toBeUndefined();
    expect(call[2].master).toBeDefined();
    expect(call[2].object instanceof Parse.User).toBeTruthy();
    expect(call[2].user instanceof Parse.User).toBeTruthy();
    expect(call[2].original instanceof Parse.User).toBeTruthy();
    expect(call[2].object.id).toEqual(user.id);
    expect(call[2].original.id).toEqual(user.id);
    expect(call[2].user.id).toEqual(user.id);
    expect(call.length).toEqual(3);
    expect(user.getSessionToken()).toBeDefined();
  });

  it('should throw if no triggers found', async () => {
    await reconfigureServer({ auth: { wrongAdapter } });
    const user = new Parse.User();
    await expectAsync(
      user.save({ authData: { wrongAdapter: { id: 'wrongAdapter' } } })
    ).toBeRejectedWithError(
      'Adapter is not configured. Implement either validateAuthData or all of the following: validateSetUp, validateLogin and validateUpdate'
    );
  });

  it('should throw if policy does not match one of default/solo/additional', async () => {
    const adapterWithBadPolicy = {
      validateAppId: () => Promise.resolve(),
      validateAuthData: () => Promise.resolve(),
      policy: 'bad',
    };
    await reconfigureServer({ auth: { adapterWithBadPolicy } });
    const user = new Parse.User();
    await expectAsync(
      user.save({ authData: { adapterWithBadPolicy: { id: 'adapterWithBadPolicy' } } })
    ).toBeRejectedWithError(
      'AuthAdapter policy is not configured correctly. The value must be either "solo", "additional", "default" or undefined (will be handled as "default")'
    );
  });

  it('should throw if no triggers found', async () => {
    await reconfigureServer({ auth: { wrongAdapter } });
    const user = new Parse.User();
    await expectAsync(
      user.save({ authData: { wrongAdapter: { id: 'wrongAdapter' } } })
    ).toBeRejectedWithError(
      'Adapter is not configured. Implement either validateAuthData or all of the following: validateSetUp, validateLogin and validateUpdate'
    );
  });

  it('should not update authData if provider return doNotSave', async () => {
    spyOn(doNotSaveAdapter, 'validateAuthData').and.resolveTo({ doNotSave: true });
    await reconfigureServer({
      auth: { doNotSaveAdapter, baseAdapter },
    });

    const user = new Parse.User();

    await user.save({
      authData: { baseAdapter: { id: 'baseAdapter' }, doNotSaveAdapter: { token: true } },
    });

    await user.fetch({ useMasterKey: true });

    expect(user.get('authData')).toEqual({ baseAdapter: { id: 'baseAdapter' } });
  });

  it('should loginWith user with auth Adapter with do not save option, mutated authData and no additional auth adapter', async () => {
    const spy = spyOn(doNotSaveAdapter, 'validateAuthData').and.resolveTo({ doNotSave: false });
    await reconfigureServer({
      auth: { doNotSaveAdapter, baseAdapter },
    });

    const user = new Parse.User();

    await user.save({
      authData: { doNotSaveAdapter: { id: 'doNotSaveAdapter' } },
    });

    await user.fetch({ useMasterKey: true });

    expect(user.get('authData')).toEqual({ doNotSaveAdapter: { id: 'doNotSaveAdapter' } });

    spy.and.resolveTo({ doNotSave: true });

    const user2 = await Parse.User.logInWith('doNotSaveAdapter', {
      authData: { id: 'doNotSaveAdapter', example: 'example' },
    });
    expect(user2.getSessionToken()).toBeDefined();
    expect(user2.id).toEqual(user.id);
  });

  it('should perform authData validation only when its required', async () => {
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({});
    spyOn(baseAdapter2, 'validateAppId').and.resolveTo({});
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({});
    await reconfigureServer({
      auth: { baseAdapter2, baseAdapter },
      allowExpiredAuthDataToken: false,
    });

    const user = new Parse.User();

    await user.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { token: true },
      },
    });

    expect(baseAdapter2.validateAuthData).toHaveBeenCalledTimes(1);
    expect(baseAdapter2.validateAppId).toHaveBeenCalledTimes(1);

    const user2 = new Parse.User();
    await user2.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
      },
    });

    expect(baseAdapter2.validateAuthData).toHaveBeenCalledTimes(1);

    const user3 = new Parse.User();
    await user3.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { token: true },
      },
    });

    expect(baseAdapter2.validateAuthData).toHaveBeenCalledTimes(2);
  });

  it('should require additional provider if configured', async () => {
    await reconfigureServer({
      auth: { baseAdapter, additionalAdapter },
    });

    const user = new Parse.User();

    await user.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        additionalAdapter: { token: true },
      },
    });

    const user2 = new Parse.User();
    await expectAsync(
      user2.save({
        authData: {
          baseAdapter: { id: 'baseAdapter' },
        },
      })
    ).toBeRejectedWithError('Missing additional authData additionalAdapter');
    expect(user2.getSessionToken()).toBeUndefined();

    await user2.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        additionalAdapter: { token: true },
      },
    });

    expect(user2.getSessionToken()).toBeDefined();
  });

  it('should skip additional provider if used provider is solo', async () => {
    await reconfigureServer({
      auth: { soloAdapter, additionalAdapter },
    });

    const user = new Parse.User();

    await user.save({
      authData: {
        soloAdapter: { id: 'soloAdapter' },
        additionalAdapter: { token: true },
      },
    });

    const user2 = new Parse.User();
    await user2.save({
      authData: {
        soloAdapter: { id: 'soloAdapter' },
      },
    });
    expect(user2.getSessionToken()).toBeDefined();
  });

  it('should return authData response and save some info on non username login', async () => {
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({
      response: { someData: true },
    });
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({
      response: { someData2: true },
      save: { otherData: true },
    });
    await reconfigureServer({
      auth: { baseAdapter, baseAdapter2 },
    });

    const user = new Parse.User();

    await user.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { test: true },
      },
    });

    expect(user.get('authDataResponse')).toEqual({
      baseAdapter: { someData: true },
      baseAdapter2: { someData2: true },
    });

    const user2 = new Parse.User();
    user2.id = user.id;
    await user2.save(
      {
        authData: {
          baseAdapter: { id: 'baseAdapter' },
          baseAdapter2: { test: true },
        },
      },
      { sessionToken: user.getSessionToken() }
    );

    expect(user2.get('authDataResponse')).toEqual({ baseAdapter2: { someData2: true } });

    const user3 = new Parse.User();
    await user3.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { test: true },
      },
    });

    // On logIn all authData are revalidated
    expect(user3.get('authDataResponse')).toEqual({
      baseAdapter: { someData: true },
      baseAdapter2: { someData2: true },
    });

    const userViaMasterKey = new Parse.User();
    userViaMasterKey.id = user2.id;
    await userViaMasterKey.fetch({ useMasterKey: true });
    expect(userViaMasterKey.get('authData')).toEqual({
      baseAdapter: { id: 'baseAdapter' },
      baseAdapter2: { otherData: true },
    });
  });

  it('should return authData response and save some info on username login', async () => {
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({
      response: { someData: true },
    });
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({
      response: { someData2: true },
      save: { otherData: true },
    });
    await reconfigureServer({
      auth: { baseAdapter, baseAdapter2 },
    });

    const user = new Parse.User();

    await user.save({
      username: 'username',
      password: 'password',
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { test: true },
      },
    });

    expect(user.get('authDataResponse')).toEqual({
      baseAdapter: { someData: true },
      baseAdapter2: { someData2: true },
    });

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      body: JSON.stringify({
        username: 'username',
        password: 'password',
        authData: {
          baseAdapter2: { test: true },
          baseAdapter: { id: 'baseAdapter' },
        },
      }),
    });
    const result = res.data;
    expect(result.authDataResponse).toEqual({
      baseAdapter2: { someData2: true },
      baseAdapter: { someData: true },
    });

    await user.fetch({ useMasterKey: true });
    expect(user.get('authData')).toEqual({
      baseAdapter: { id: 'baseAdapter' },
      baseAdapter2: { otherData: true },
    });
  });

  describe('should allow update of authData', () => {
    beforeEach(async () => {
      spyOn(baseAdapter, 'validateAuthData').and.resolveTo({
        response: { someData: true },
      });
      spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({
        response: { someData2: true },
        save: { otherData: true },
      });
      await reconfigureServer({
        auth: { baseAdapter, baseAdapter2 },
      });
    });

    it('should not re validate the baseAdapter when user is already logged in and authData not changed', async () => {
      const user = new Parse.User();

      await user.save({
        username: 'username',
        password: 'password',
        authData: {
          baseAdapter: { id: 'baseAdapter' },
          baseAdapter2: { test: true },
        },
      });
      expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(1);

      expect(user.id).toBeDefined();
      expect(user.getSessionToken()).toBeDefined();
      await user.save(
        {
          authData: {
            baseAdapter2: { test: true },
            baseAdapter: { id: 'baseAdapter' },
          },
        },
        { sessionToken: user.getSessionToken() }
      );

      expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(1);
    });

    it('should not re-validate the baseAdapter when master key is used and authData has not changed', async () => {
      const user = new Parse.User();
      await user.save({
        username: 'username',
        password: 'password',
        authData: {
          baseAdapter: { id: 'baseAdapter' },
          baseAdapter2: { test: true },
        },
      });
      await user.save(
        {
          authData: {
            baseAdapter2: { test: true },
            baseAdapter: { id: 'baseAdapter' },
          },
        },
        { useMasterKey: true }
      );

      expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(1);
    });

    it('should allow user to change authData', async () => {
      const user = new Parse.User();
      await user.save({
        username: 'username',
        password: 'password',
        authData: {
          baseAdapter: { id: 'baseAdapter' },
          baseAdapter2: { test: true },
        },
      });
      await user.save(
        {
          authData: {
            baseAdapter2: { test: true },
            baseAdapter: { id: 'baseAdapter2' },
          },
        },
        { sessionToken: user.getSessionToken() }
      );

      expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(2);
    });

    it('should allow master key to change authData', async () => {
      const user = new Parse.User();
      await user.save({
        username: 'username',
        password: 'password',
        authData: {
          baseAdapter: { id: 'baseAdapter' },
          baseAdapter2: { test: true },
        },
      });
      await user.save(
        {
          authData: {
            baseAdapter2: { test: true },
            baseAdapter: { id: 'baseAdapter3' },
          },
        },
        { useMasterKey: true }
      );

      expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(2);

      await user.fetch({ useMasterKey: true });
      expect(user.get('authData')).toEqual({
        baseAdapter: { id: 'baseAdapter3' },
        baseAdapter2: { otherData: true },
      });
    });
  });

  it('should pass user to auth adapter on update by matching session', async () => {
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({});
    await reconfigureServer({ auth: { baseAdapter2 } });

    const user = new Parse.User();

    const payload = { someData: true };

    await user.save({
      username: 'test',
      password: 'password',
    });

    expect(user.getSessionToken()).toBeDefined();

    await user.save(
      { authData: { baseAdapter2: payload } },
      { sessionToken: user.getSessionToken() }
    );

    const firstCall = baseAdapter2.validateAuthData.calls.argsFor(0);
    expect(firstCall[0]).toEqual(payload);
    expect(firstCall[1]).toEqual(baseAdapter2);
    expect(firstCall[2].isChallenge).toBeUndefined();
    expect(firstCall[2].master).toBeDefined();
    expect(firstCall[2].object instanceof Parse.User).toBeTruthy();
    expect(firstCall[2].user instanceof Parse.User).toBeTruthy();
    expect(firstCall[2].original instanceof Parse.User).toBeTruthy();
    expect(firstCall[2].object.id).toEqual(user.id);
    expect(firstCall[2].original.id).toEqual(user.id);
    expect(firstCall[2].user.id).toEqual(user.id);
    expect(firstCall.length).toEqual(3);

    await user.save({ authData: { baseAdapter2: payload } }, { useMasterKey: true });

    const secondCall = baseAdapter2.validateAuthData.calls.argsFor(1);
    expect(secondCall[0]).toEqual(payload);
    expect(secondCall[1]).toEqual(baseAdapter2);
    expect(secondCall[2].isChallenge).toBeUndefined();
    expect(secondCall[2].master).toEqual(true);
    expect(secondCall[2].user).toBeUndefined();
    expect(secondCall[2].object instanceof Parse.User).toBeTruthy();
    expect(secondCall[2].original instanceof Parse.User).toBeTruthy();
    expect(secondCall[2].object.id).toEqual(user.id);
    expect(secondCall[2].original.id).toEqual(user.id);
    expect(secondCall.length).toEqual(3);
  });

  it('should return custom errors', async () => {
    const throwInChallengeAdapter = {
      validateAppId: () => Promise.resolve(),
      validateAuthData: () => Promise.resolve(),
      challenge: () => Promise.reject('Invalid challenge data: yolo'),
      options: {
        anOption: true,
      },
    };
    const throwInSetup = {
      validateAppId: () => Promise.resolve(),
      validateSetUp: () => Promise.reject('You cannot signup with that setup data.'),
      validateUpdate: () => Promise.resolve(),
      validateLogin: () => Promise.resolve(),
    };

    const throwInUpdate = {
      validateAppId: () => Promise.resolve(),
      validateSetUp: () => Promise.resolve(),
      validateUpdate: () => Promise.reject('You cannot update with that update data.'),
      validateLogin: () => Promise.resolve(),
    };

    const throwInLogin = {
      validateAppId: () => Promise.resolve(),
      validateSetUp: () => Promise.resolve(),
      validateUpdate: () => Promise.resolve(),
      validateLogin: () => Promise.reject('You cannot login with that login data.'),
    };
    await reconfigureServer({
      auth: { challengeAdapter: throwInChallengeAdapter },
    });
    let logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});
    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
        }),
      })
    ).toBeRejectedWithError('Invalid challenge data: yolo');
    expect(logger.error).toHaveBeenCalledWith(
      `Failed running auth step challenge for challengeAdapter for user undefined with Error: {"message":"Invalid challenge data: yolo","code":${Parse.Error.SCRIPT_FAILED}}`,
      {
        authenticationStep: 'challenge',
        error: new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid challenge data: yolo'),
        user: undefined,
        provider: 'challengeAdapter',
      }
    );

    await reconfigureServer({ auth: { modernAdapter: throwInSetup } });
    logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});
    let user = new Parse.User();
    await expectAsync(
      user.save({ authData: { modernAdapter: { id: 'modernAdapter' } } })
    ).toBeRejectedWith(
      new Parse.Error(Parse.Error.SCRIPT_FAILED, 'You cannot signup with that setup data.')
    );
    expect(logger.error).toHaveBeenCalledWith(
      `Failed running auth step validateSetUp for modernAdapter for user undefined with Error: {"message":"You cannot signup with that setup data.","code":${Parse.Error.SCRIPT_FAILED}}`,
      {
        authenticationStep: 'validateSetUp',
        error: new Parse.Error(
          Parse.Error.SCRIPT_FAILED,
          'You cannot signup with that setup data.'
        ),
        user: undefined,
        provider: 'modernAdapter',
      }
    );

    await reconfigureServer({ auth: { modernAdapter: throwInUpdate } });
    logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});
    user = new Parse.User();
    await user.save({ authData: { modernAdapter: { id: 'updateAdapter' } } });
    await expectAsync(
      user.save(
        { authData: { modernAdapter: { id: 'updateAdapter2' } } },
        { sessionToken: user.getSessionToken() }
      )
    ).toBeRejectedWith(
      new Parse.Error(Parse.Error.SCRIPT_FAILED, 'You cannot update with that update data.')
    );

    expect(logger.error).toHaveBeenCalledWith(
      `Failed running auth step validateUpdate for modernAdapter for user ${user.id} with Error: {"message":"You cannot update with that update data.","code":${Parse.Error.SCRIPT_FAILED}}`,
      {
        authenticationStep: 'validateUpdate',
        error: new Parse.Error(
          Parse.Error.SCRIPT_FAILED,
          'You cannot update with that update data.'
        ),
        user: user.id,
        provider: 'modernAdapter',
      }
    );

    await reconfigureServer({
      auth: { modernAdapter: throwInLogin },
      allowExpiredAuthDataToken: false,
    });
    logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});
    user = new Parse.User();
    await user.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });
    const user2 = new Parse.User();
    await expectAsync(
      user2.save({ authData: { modernAdapter: { id: 'modernAdapter' } } })
    ).toBeRejectedWith(
      new Parse.Error(Parse.Error.SCRIPT_FAILED, 'You cannot login with that login data.')
    );
    expect(logger.error).toHaveBeenCalledWith(
      `Failed running auth step validateLogin for modernAdapter for user ${user.id} with Error: {"message":"You cannot login with that login data.","code":${Parse.Error.SCRIPT_FAILED}}`,
      {
        authenticationStep: 'validateLogin',
        error: new Parse.Error(Parse.Error.SCRIPT_FAILED, 'You cannot login with that login data.'),
        user: user.id,
        provider: 'modernAdapter',
      }
    );
  });

  it('should return challenge with no logged user', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });

    await reconfigureServer({
      auth: { challengeAdapter },
    });

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: {},
      })
    ).toBeRejectedWithError('Nothing to challenge.');

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: { challengeData: true },
      })
    ).toBeRejectedWithError('challengeData should be an object.');

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: { challengeData: { data: true }, authData: true },
      })
    ).toBeRejectedWithError('authData should be an object.');

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        challengeData: {
          challengeAdapter: { someData: true },
        },
      }),
    });

    expect(res.data).toEqual({
      challengeData: {
        challengeAdapter: {
          token: 'test',
        },
      },
    });
    const challengeCall = challengeAdapter.challenge.calls.argsFor(0);
    expect(challengeAdapter.challenge).toHaveBeenCalledTimes(1);
    expect(challengeCall[0]).toEqual({ someData: true });
    expect(challengeCall[1]).toBeUndefined();
    expect(challengeCall[2]).toEqual(challengeAdapter);
    expect(challengeCall[3].master).toBeDefined();
    expect(challengeCall[3].headers).toBeDefined();
    expect(challengeCall[3].object).toBeUndefined();
    expect(challengeCall[3].original).toBeUndefined();
    expect(challengeCall[3].user).toBeUndefined();
    expect(challengeCall[3].isChallenge).toBeTruthy();
    expect(challengeCall.length).toEqual(4);
  });

  it('should return empty challenge data response if challenged provider does not exists', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });

    await reconfigureServer({
      auth: { challengeAdapter },
    });

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        challengeData: {
          nonExistingProvider: { someData: true },
        },
      }),
    });

    expect(res.data).toEqual({ challengeData: {} });
  });
  it('should return challenge with username created user', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });

    await reconfigureServer({
      auth: { challengeAdapter },
    });

    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          username: 'username',
          challengeData: {
            challengeAdapter: { someData: true },
          },
        }),
      })
    ).toBeRejectedWithError('You provided username or email, you need to also provide password.');

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          username: 'username',
          password: 'password',
          authData: { data: true },
          challengeData: {
            challengeAdapter: { someData: true },
          },
        }),
      })
    ).toBeRejectedWithError(
      'You cannot provide username/email and authData, only use one identification method.'
    );

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        username: 'username',
        password: 'password',
        challengeData: {
          challengeAdapter: { someData: true },
        },
      }),
    });

    expect(res.data).toEqual({
      challengeData: {
        challengeAdapter: {
          token: 'test',
        },
      },
    });

    const challengeCall = challengeAdapter.challenge.calls.argsFor(0);
    expect(challengeAdapter.challenge).toHaveBeenCalledTimes(1);
    expect(challengeCall[0]).toEqual({ someData: true });
    expect(challengeCall[1]).toEqual(undefined);
    expect(challengeCall[2]).toEqual(challengeAdapter);
    expect(challengeCall[3].master).toBeDefined();
    expect(challengeCall[3].isChallenge).toBeTruthy();
    expect(challengeCall[3].user).toBeUndefined();
    expect(challengeCall[3].object instanceof Parse.User).toBeTruthy();
    expect(challengeCall[3].original instanceof Parse.User).toBeTruthy();
    expect(challengeCall[3].object.id).toEqual(user.id);
    expect(challengeCall[3].original.id).toEqual(user.id);
    expect(challengeCall.length).toEqual(4);
  });

  it('should return challenge with authData created user', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });
    spyOn(challengeAdapter, 'validateAuthData').and.callThrough();

    await reconfigureServer({
      auth: { challengeAdapter, soloAdapter },
    });

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
          authData: {
            challengeAdapter: { id: 'challengeAdapter' },
          },
        }),
      })
    ).toBeRejectedWithError('User not found.');

    const user = new Parse.User();
    await user.save({ authData: { challengeAdapter: { id: 'challengeAdapter' } } });

    const user2 = new Parse.User();
    await user2.save({ authData: { soloAdapter: { id: 'soloAdapter' } } });

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
          authData: {
            challengeAdapter: { id: 'challengeAdapter' },
            soloAdapter: { id: 'soloAdapter' },
          },
        }),
      })
    ).toBeRejectedWithError('You cannot provide more than one authData provider with an id.');

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        challengeData: {
          challengeAdapter: { someData: true },
        },
        authData: {
          challengeAdapter: { id: 'challengeAdapter' },
        },
      }),
    });

    expect(res.data).toEqual({
      challengeData: {
        challengeAdapter: {
          token: 'test',
        },
      },
    });

    const validateCall = challengeAdapter.validateAuthData.calls.argsFor(1);
    expect(validateCall[2].isChallenge).toBeTruthy();

    const challengeCall = challengeAdapter.challenge.calls.argsFor(0);
    expect(challengeAdapter.challenge).toHaveBeenCalledTimes(1);
    expect(challengeCall[0]).toEqual({ someData: true });
    expect(challengeCall[1]).toEqual({ id: 'challengeAdapter' });
    expect(challengeCall[2]).toEqual(challengeAdapter);
    expect(challengeCall[3].master).toBeDefined();
    expect(challengeCall[3].isChallenge).toBeTruthy();
    expect(challengeCall[3].object instanceof Parse.User).toBeTruthy();
    expect(challengeCall[3].original instanceof Parse.User).toBeTruthy();
    expect(challengeCall[3].object.id).toEqual(user.id);
    expect(challengeCall[3].original.id).toEqual(user.id);
    expect(challengeCall.length).toEqual(4);
  });

  it('should validate provided authData and prevent guess id attack', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });

    await reconfigureServer({
      auth: { challengeAdapter, soloAdapter },
    });

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
          authData: {
            challengeAdapter: { id: 'challengeAdapter' },
          },
        }),
      })
    ).toBeRejectedWithError('User not found.');

    const user = new Parse.User();
    await user.save({ authData: { challengeAdapter: { id: 'challengeAdapter' } } });

    spyOn(challengeAdapter, 'validateAuthData').and.rejectWith({});

    await expectAsync(
      requestWithExpectedError({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
          authData: {
            challengeAdapter: { id: 'challengeAdapter' },
          },
        }),
      })
    ).toBeRejectedWithError('User not found.');

    const validateCall = challengeAdapter.validateAuthData.calls.argsFor(0);
    expect(challengeAdapter.validateAuthData).toHaveBeenCalledTimes(1);
    expect(validateCall[0]).toEqual({ id: 'challengeAdapter' });
    expect(validateCall[1]).toEqual(challengeAdapter);
    expect(validateCall[2].isChallenge).toBeTruthy();
    expect(validateCall[2].master).toBeDefined();
    expect(validateCall[2].object instanceof Parse.User).toBeTruthy();
    expect(validateCall[2].original instanceof Parse.User).toBeTruthy();
    expect(validateCall[2].object.id).toEqual(user.id);
    expect(validateCall[2].original.id).toEqual(user.id);
    expect(validateCall.length).toEqual(3);
  });

  it('should work with multiple adapters', async () => {
    const adapterA = {
      validateAppId: () => Promise.resolve(),
      validateAuthData: () => Promise.resolve(),
    };
    const adapterB = {
      validateAppId: () => Promise.resolve(),
      validateAuthData: () => Promise.resolve(),
    };
    await reconfigureServer({ auth: { adapterA, adapterB } });
    const user = new Parse.User();
    await user.signUp({
      username: 'test',
      password: 'password',
    });
    await user.save({ authData: { adapterA: { id: 'testA' } } });
    expect(user.get('authData')).toEqual({ adapterA: { id: 'testA' } });
    await user.save({ authData: { adapterA: null, adapterB: { id: 'test' } } });
    await user.fetch({ useMasterKey: true });
    expect(user.get('authData')).toEqual({ adapterB: { id: 'test' } });
  });
});
