'use strict';

const request = require('../lib/request');
const otplib = require('otplib');

describe('MFA', () => {
  function enableMFA(user) {
    return request({
      method: 'GET',
      url: 'http://localhost:8378/1/users/me/enableMFA',
      json: true,
      headers: {
        'X-Parse-Session-Token': user && user.getSessionToken(),
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
      },
    });
  }

  function verifyMFA(user, token) {
    return request({
      method: 'POST',
      url: 'http://localhost:8378/1/users/me/verifyMFA',
      body: {
        token,
      },
      headers: {
        'X-Parse-Session-Token': user && user.getSessionToken(),
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    });
  }

  function loginWithMFA(username, password, token, recoveryTokens) {
    let req = `http://localhost:8378/1/login?username=${username}&password=${password}`;
    if (token) {
      req += `&token=${token}`;
    }
    if (recoveryTokens) {
      req += `&recoveryTokens=${recoveryTokens}`;
    }
    return request({
      method: 'POST',
      url: req,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    });
  }

  it('should enable MFA tokens', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
      },
      appName: 'testApp',
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret, qrcodeURL },
    } = await enableMFA(user); // this function would be user.enable2FA() one SDK is updated
    expect(qrcodeURL).toBeDefined();
    expect(qrcodeURL).toContain('otpauth://totp/testApp');
    expect(qrcodeURL).toContain('secret');
    expect(qrcodeURL).toContain('username');
    expect(qrcodeURL).toContain('period');
    expect(qrcodeURL).toContain('digits');
    expect(qrcodeURL).toContain('algorithm');
    const token = otplib.authenticator.generate(secret); // this token would be generated from authenticator
    await verifyMFA(user, token); // this function would be user.verifyMFA()
    await Parse.User.logOut();
    let verifytoken = '';
    const mfaLogin = async () => {
      try {
        const result = await loginWithMFA('username', 'password', verifytoken); // Parse.User.login('username','password',verifytoken);
        if (!verifytoken) {
          throw 'Should not have been able to login.';
        }
        const newUser = result.data;
        expect(newUser.objectId).toBe(user.id);
        expect(newUser.username).toBe('username');
        expect(newUser.createdAt).toBe(user.createdAt.toISOString());
        expect(newUser.mfaEnabled).toBe(true);
      } catch (err) {
        expect(err.text).toMatch('{"code":211,"error":"Please provide your MFA token."}');
        verifytoken = otplib.authenticator.generate(secret);
        if (err.text.includes('211')) {
          // this user is 2FA enroled, get code
          await mfaLogin();
        }
      }
    };
    await mfaLogin();
  });

  it('can reject MFA', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enableMFA(user);
    const token = otplib.authenticator.generate(secret);
    await verifyMFA(user, token);
    await Parse.User.logOut();
    try {
      await loginWithMFA('username', 'password', '123102');
      throw 'should not be able to login.';
    } catch (e) {
      expect(e.text).toBe('{"code":210,"error":"Invalid MFA token"}');
    }
  });

  it('can encrypt MFA tokens', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enableMFA(user);
    const token = otplib.authenticator.generate(secret);
    await verifyMFA(user, token);
    await Parse.User.logOut();
    let verifytoken = '';
    const mfaLogin = async () => {
      try {
        const result = await loginWithMFA('username', 'password', verifytoken);
        if (!verifytoken) {
          throw 'Should not have been able to login.';
        }
        const newUser = result.data;
        expect(newUser.objectId).toBe(user.id);
        expect(newUser.username).toBe('username');
        expect(newUser.createdAt).toBe(user.createdAt.toISOString());
        expect(newUser._mfa).toBeUndefined();
        expect(newUser.mfaEnabled).toBe(true);
      } catch (err) {
        expect(err.text).toMatch('{"code":211,"error":"Please provide your MFA token."}');
        verifytoken = otplib.authenticator.generate(secret);
        if (err.text.includes('211')) {
          await mfaLogin();
        }
      }
    };
    await mfaLogin();
  });

  it('can get and recover MFA', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enableMFA(user);
    const token = otplib.authenticator.generate(secret);
    const {
      data: { recoveryKeys },
    } = await verifyMFA(user, token);
    expect(recoveryKeys.length).toBe(2);
    expect(recoveryKeys[0].length).toBe(20);
    expect(recoveryKeys[1].length).toBe(20);
    await Parse.User.logOut();
    const result = await loginWithMFA('username', 'password', null, recoveryKeys);
    const newUser = result.data;
    expect(newUser.objectId).toBe(user.id);
    expect(newUser.username).toBe('username');
    expect(newUser.createdAt).toBe(user.createdAt.toISOString());
    expect(newUser._mfa).toBeUndefined();
    expect(newUser.mfaEnabled).toBe(false);
  });

  it('returns error on invalid recovery', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enableMFA(user);
    const token = otplib.authenticator.generate(secret);
    await verifyMFA(user, token);
    await Parse.User.logOut();
    try {
      await loginWithMFA('username', 'password', null, ['12345678910', '12345678910']);
      fail('should have not been able to login with invalid recovery keys');
    } catch (err) {
      expect(err.text).toMatch('{"code":210,"error":"Invalid MFA recovery tokens"}');
    }
  });

  it('cannot set _mfa or mfa', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enableMFA(user);
    const token = otplib.authenticator.generate(secret);
    await verifyMFA(user, token);
    user.set('_mfa', 'foo');
    user.set('mfa', 'foo');
    await user.save(null, { sessionToken: user.getSessionToken() });
    await Parse.User.logOut();
    let verifytoken = '';
    const mfaLogin = async () => {
      try {
        const result = await loginWithMFA('username', 'password', verifytoken);
        if (!verifytoken) {
          throw 'Should not have been able to login.';
        }
        const newUser = result.data;
        expect(newUser.objectId).toBe(user.id);
        expect(newUser.username).toBe('username');
        expect(newUser.createdAt).toBe(user.createdAt.toISOString());
        expect(newUser._mfa).toBeUndefined();
        expect(newUser.mfaEnabled).toBe(true);
      } catch (err) {
        expect(err.text).toMatch('{"code":211,"error":"Please provide your MFA token."}');
        verifytoken = otplib.authenticator.generate(secret);
        if (err.text.includes('211')) {
          await mfaLogin();
        }
      }
    };
    await mfaLogin();
  });

  it('cannot call enableMFA without user', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    try {
      await enableMFA();
      fail('should not be able to enable MFA without a user.');
    } catch (err) {
      expect(err.text).toMatch('{"code":101,"error":"Unauthorized"}');
    }
    try {
      await verifyMFA();
      fail('should not be able to enable MFA without a user.');
    } catch (err) {
      expect(err.text).toMatch('{"code":101,"error":"Unauthorized"}');
    }
  });

  it('throws on second time enabling MFA', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enableMFA(user);
    const token = otplib.authenticator.generate(secret);
    await verifyMFA(user, token);
    try {
      await verifyMFA(user, token);
    } catch (err) {
      expect(err.text).toMatch('{"code":210,"error":"MFA is already active"}');
    }
  });

  it('prevent setting on mfw / MFA tokens', async () => {
    const user = await Parse.User.signUp('username', 'password');
    user.set('mfaEnabled', true);
    user.set('mfa', true);
    user.set('_mfa', true);
    await user.save(null, { sessionToken: user.getSessionToken() });
    await user.fetch({ sessionToken: user.getSessionToken() });
    expect(user.get('mfaEnabled')).toBeUndefined();
    expect(user.get('mfa')).toBeUndefined();
    expect(user.get('_mfa')).toBeUndefined();
  });

  it('verify throws correct error', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    try {
      await enableMFA(user);
      await verifyMFA(user);
    } catch (e) {
      expect(e.text).toBe('{"code":211,"error":"Please provide a token."}');
    }
    try {
      await verifyMFA(user, 'tokenhere');
    } catch (e) {
      expect(e.text).toBe('{"code":210,"error":"Invalid token"}');
    }
  });

  it('can prevent re-enabling MFA', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enableMFA(user);
    const token = otplib.authenticator.generate(secret);
    await verifyMFA(user, token);
    try {
      await enableMFA(user);
    } catch (e) {
      expect(e.text).toBe('{"code":210,"error":"MFA is already enabled on this account."}');
    }
  });

  it('disabled MFA throws correct error', async () => {
    await reconfigureServer({
      multiFactorAuth: {
        enabled: false,
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    try {
      await enableMFA(user);
    } catch (e) {
      expect(e.text).toBe('{"code":210,"error":"MFA is not enabled."}');
    }
    try {
      await verifyMFA(user, 'tokenhere');
    } catch (e) {
      expect(e.text).toBe('{"code":210,"error":"MFA is not enabled."}');
    }
  });
});
