const request = require('../lib/request');
const TOTP = require('otpauth').TOTP;

describe('Dashboard', () => {
  const signup = (master, mfa) =>
    request({
      url: `${Parse.serverURL}/dashboardSignup`,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': master ? Parse.masterKey : null,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: {
        username: 'test@example.com',
        password: 'password',
        mfa,
        mfaOptions: {
          algorithm: 'SHA1',
          period: 30,
          digits: 6,
        },
        features: {
          globalConfig: {
            create: true,
            read: true,
            update: true,
            delete: true,
          },
          hooks: {
            create: true,
            read: true,
            update: true,
            delete: true,
          },
          cloudCode: {
            jobs: true,
          },
          logs: {
            level: true,
            size: true,
            order: true,
            until: true,
            from: true,
          },
          push: {
            immediatePush: true,
            pushAudiences: true,
            localization: true,
          },
          schemas: {
            addField: true,
            removeField: true,
            addClass: true,
            removeClass: true,
            clearAllDataFromClass: true,
            exportClass: false,
            editClassLevelPermissions: true,
            editPointerPermissions: true,
          },
        },
      },
      followRedirects: false,
    }).catch(e => e);

  const login = (password, otp) =>
    request({
      url: `${Parse.serverURL}/dashboardLogin`,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: {
        username: 'test@example.com',
        password,
        otp,
      },
      followRedirects: false,
    }).catch(e => e);
  it('creating a user responds with 403 without masterKey', async () => {
    const response = await signup();
    expect(response.status).toBe(403);
  });

  it('creating a user responds with masterKey', async () => {
    const response = await signup(true);
    expect(response.status).toBe(201);
    expect(response.text).toContain('test@example.com');
  });

  it('cannot query dashboard user class', async () => {
    const response = await signup(true);
    expect(response.status).toBe(201);
    expect(response.text).toContain('test@example.com');
    await expectAsync(new Parse.Query('_DashboardUser').first()).toBeRejectedWith(
      new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        "Clients aren't allowed to perform the find operation on the _DashboardUser collection."
      )
    );
  });

  it('can query dashboard user class with masterKey', async () => {
    const response = await signup(true);
    expect(response.status).toBe(201);
    expect(response.text).toContain('test@example.com');
    const [user] = await new Parse.Query('_DashboardUser').find({ useMasterKey: true });
    expect(user).toBeDefined();
    expect(user.get('password')).toBeUndefined();
    expect(user.get('mfaOptions')).toBeUndefined();
  });

  it('dashboard can signup and then login', async () => {
    const response = await signup(true, true);
    expect(response.status).toBe(201);
    expect(response.text).toContain('test@example.com');
    const { mfaSecret } = JSON.parse(response.text);
    const totp = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: mfaSecret,
    });
    const loginResponse = await login('password', totp.generate());
    expect(loginResponse.status).toEqual(200);
    const user = JSON.parse(loginResponse.text);
    expect(user.username).toEqual('test@example.com');
    expect(user.features).toBeDefined();
    expect(user.features.globalConfig).toBeDefined();
    expect(user.features.hooks).toBeDefined();
    expect(user.features.cloudCode).toBeDefined();
    expect(user.features.logs).toBeDefined();
    expect(user.features.push).toBeDefined();
    expect(user.features.schemas).toBeDefined();
  });

  it('dashboard can signup and then login without mfa', async () => {
    const response = await signup(true, false);
    expect(response.status).toBe(201);
    expect(response.text).toContain('test@example.com');
    const loginResponse = await login('password');
    expect(loginResponse.status).toEqual(200);
    const user = JSON.parse(loginResponse.text);
    expect(user.username).toEqual('test@example.com');
    expect(user.features).toBeDefined();
    expect(user.features.globalConfig).toBeDefined();
    expect(user.features.hooks).toBeDefined();
    expect(user.features.cloudCode).toBeDefined();
    expect(user.features.logs).toBeDefined();
    expect(user.features.push).toBeDefined();
    expect(user.features.schemas).toBeDefined();
  });

  it('dashboard can signup and rejects login with invalid password', async () => {
    const response = await signup(true, false);
    expect(response.status).toBe(201);
    expect(response.text).toContain('test@example.com');
    const loginResponse = await login('password2');
    expect(loginResponse.status).toEqual(404);
    expect(loginResponse.text).toEqual(`{"code":101,"error":"Invalid username/password."}`);
  });

  it('dashboard can signup and rejects login with invalid mfa', async () => {
    const response = await signup(true, true);
    expect(response.status).toBe(201);
    expect(response.text).toContain('test@example.com');
    const loginResponse = await login('password');
    expect(loginResponse.status).toEqual(400);
    expect(loginResponse.text).toEqual(
      `{"code":211,"error":"Please specify a One Time password."}`
    );
    const invalidMFAResponse = await login('password', 123456);
    expect(invalidMFAResponse.status).toEqual(400);
    expect(invalidMFAResponse.text).toEqual(`{"code":210,"error":"Invalid One Time Password."}`);
  });
});
