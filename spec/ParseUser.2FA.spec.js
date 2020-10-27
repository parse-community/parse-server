'use strict';

const request = require('../lib/request');
const otplib = require('otplib');

describe('2FA', () => {
  function enable2FA(user) {
    return request({
      method: 'GET',
      url: 'http://localhost:8378/1/users/me/enable2FA',
      json: true,
      headers: {
        'X-Parse-Session-Token': user.getSessionToken(),
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
      },
    });
  }

  function validate2FA(user, token) {
    return request({
      method: 'POST',
      url: 'http://localhost:8378/1/users/me/verify2FA',
      body: {
        token,
      },
      headers: {
        'X-Parse-Session-Token': user.getSessionToken(),
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    });
  }

  function loginWith2Fa(username, password, token) {
    let req = `http://localhost:8378/1/login?username=${username}&password=${password}`;
    if (token) {
      req += `&token=${token}`;
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

  it('should enable 2FA tokens', async () => {
    await reconfigureServer({
      twoFactor: {
        enabled: true,
      },
      appName: 'testApp',
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret, qrcodeURL },
    } = await enable2FA(user);
    expect(qrcodeURL).toBeDefined();
    expect(qrcodeURL).toContain('otpauth://totp/testApp');
    expect(qrcodeURL).toContain('secret');
    expect(qrcodeURL).toContain('username');
    expect(qrcodeURL).toContain('period');
    expect(qrcodeURL).toContain('digits');
    expect(qrcodeURL).toContain('algorithm');
    const token = otplib.authenticator.generate(secret);
    await validate2FA(user, token);
    await Parse.User.logOut();
    let verifytoken = '';
    const mfaLogin = async () => {
      try {
        const result = await loginWith2Fa('username', 'password', verifytoken);
        if (!verifytoken) {
          throw 'Should not have been able to login.';
        }
        const newUser = result.data;
        expect(newUser.objectId).toBe(user.id);
        expect(newUser.username).toBe('username');
        expect(newUser.createdAt).toBe(user.createdAt.toISOString());
        expect(newUser.MFAEnabled).toBe(true);
      } catch (err) {
        expect(err.text).toMatch('{"code":211,"error":"Please provide your 2FA token."}');
        verifytoken = otplib.authenticator.generate(secret);
        if (err.text.includes('211')) {
          await mfaLogin();
        }
      }
    };
    await mfaLogin();
  });

  it('can reject 2FA', async () => {
    await reconfigureServer({
      twoFactor: {
        enabled: true,
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enable2FA(user);
    const token = otplib.authenticator.generate(secret);
    await validate2FA(user, token);
    await Parse.User.logOut();
    try {
      await loginWith2Fa('username', 'password', '123102');
      throw 'should not be able to login.';
    } catch (e) {
      expect(e.text).toBe('{"code":212,"error":"Invalid 2FA token"}');
    }
  });

  it('can encrypt 2FA tokens', async () => {
    await reconfigureServer({
      twoFactor: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enable2FA(user);
    const token = otplib.authenticator.generate(secret);
    await validate2FA(user, token);
    await Parse.User.logOut();
    let verifytoken = '';
    const mfaLogin = async () => {
      try {
        const result = await loginWith2Fa('username', 'password', verifytoken);
        if (!verifytoken) {
          throw 'Should not have been able to login.';
        }
        const newUser = result.data;
        expect(newUser.objectId).toBe(user.id);
        expect(newUser.username).toBe('username');
        expect(newUser.createdAt).toBe(user.createdAt.toISOString());
        expect(newUser._mfa).toBeUndefined();
      } catch (err) {
        expect(err.text).toMatch('{"code":211,"error":"Please provide your 2FA token."}');
        verifytoken = otplib.authenticator.generate(secret);
        if (err.text.includes('211')) {
          await mfaLogin();
        }
      }
    };
    await mfaLogin();
  });
  it('cannot set _mfa or mfa', async () => {
    await reconfigureServer({
      twoFactor: {
        enabled: true,
        encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD',
      },
    });
    const user = await Parse.User.signUp('username', 'password');
    const {
      data: { secret },
    } = await enable2FA(user);
    const token = otplib.authenticator.generate(secret);
    await validate2FA(user, token);
    user.set('_mfa', 'foo');
    user.set('mfa', 'foo');
    await user.save(null, { sessionToken: user.getSessionToken() });
    await Parse.User.logOut();
    let verifytoken = '';
    const mfaLogin = async () => {
      try {
        const result = await loginWith2Fa('username', 'password', verifytoken);
        if (!verifytoken) {
          throw 'Should not have been able to login.';
        }
        const newUser = result.data;
        expect(newUser.objectId).toBe(user.id);
        expect(newUser.username).toBe('username');
        expect(newUser.createdAt).toBe(user.createdAt.toISOString());
        expect(newUser._mfa).toBeUndefined();
      } catch (err) {
        expect(err.text).toMatch('{"code":211,"error":"Please provide your 2FA token."}');
        verifytoken = otplib.authenticator.generate(secret);
        if (err.text.includes('211')) {
          await mfaLogin();
        }
      }
    };
    await mfaLogin();
  });
  it('prevent setting on mfw / 2fa tokens', async () => {
    const user = await Parse.User.signUp('username', 'password');
    user.set('MFAEnabled', true);
    user.set('mfa', true);
    user.set('_mfa', true);
    await user.save(null, { sessionToken: user.getSessionToken() });
    await user.fetch({ sessionToken: user.getSessionToken() });
    expect(user.get('MFAEnabled')).toBeUndefined();
    expect(user.get('mfa')).toBeUndefined();
    expect(user.get('_mfa')).toBeUndefined();
  });
});
