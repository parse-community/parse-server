'use strict';

const Auth = require('../lib/Auth');
const Config = require('../lib/Config');
const request = require('../lib/request');
const { resolvingPromise, sleep } = require('../lib/TestUtils');
const MockEmailAdapterWithOptions = require('./support/MockEmailAdapterWithOptions');

describe('Email Verification Token Expiration:', () => {
  it('show the invalid verification link page, if the user clicks on the verify email link after the email verify token expires', async ()  => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 0.5, // 0.5 second
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    // wait for 1 second - simulate user behavior to some extent
    await sleep(1000);

    expect(sendEmailOptions).not.toBeUndefined();

    const response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    const url = new URL(sendEmailOptions.link);
    const token = url.searchParams.get('token');
    expect(response.text).toEqual(
      `Found. Redirecting to http://localhost:8378/1/apps/invalid_verification_link.html?appId=test&token=${token}`
    );
  });

  it('emailVerified should set to false, if the user does not verify their email before the email verify token expires', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 0.5, // 0.5 second
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    // wait for 1 second - simulate user behavior to some extent
    await sleep(1000);

    expect(sendEmailOptions).not.toBeUndefined();

    const response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    await user.fetch();
    expect(user.get('emailVerified')).toEqual(false);
  });

  it_id('f20dd3c2-87d9-4bc6-a51d-4ea2834acbcc')(it)('if user clicks on the email verify link before email verification token expiration then show the verify email success page', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    const response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    expect(response.text).toEqual(
      'Found. Redirecting to http://localhost:8378/1/apps/verify_email_success.html'
    );
  });

  it_id('94956799-c85e-4297-b879-e2d1f985394c')(it)('if user clicks on the email verify link before email verification token expiration then emailVerified should be true', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    const response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    await user.fetch();
    expect(user.get('emailVerified')).toEqual(true);
  });

  it_id('25f3f895-c987-431c-9841-17cb6aaf18b5')(it)('if user clicks on the email verify link before email verification token expiration then user should be able to login', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    const response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    const verifiedUser = await Parse.User.logIn('testEmailVerifyTokenValidity', 'expiringToken');
    expect(typeof verifiedUser).toBe('object');
    expect(verifiedUser.get('emailVerified')).toBe(true);
  });

  it_id('c6a3e188-9065-4f50-842d-454d1e82f289')(it)('sets the _email_verify_token_expires_at and _email_verify_token fields after user SignUp', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('sets_email_verify_token_expires_at');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    const config = Config.get('test');
    const results = await config.database.find(
      '_User',
      {
        username: 'sets_email_verify_token_expires_at',
      },
      {},
      Auth.maintenance(config)
    );
    expect(results.length).toBe(1);
    const verifiedUser = results[0];
    expect(typeof verifiedUser).toBe('object');
    expect(verifiedUser.emailVerified).toEqual(false);
    expect(typeof verifiedUser._email_verify_token).toBe('string');
    expect(typeof verifiedUser._email_verify_token_expires_at).toBe('object');
    expect(sendEmailOptions).toBeDefined();
  });

  it('can resend email using an expired token', async () => {
    const user = new Parse.User();
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('test');
    user.setPassword('password');
    user.set('email', 'user@example.com');
    await user.signUp();

    await Parse.Server.database.update(
      '_User',
      { objectId: user.id },
      {
        _email_verify_token_expires_at: Parse._encode(new Date('2000')),
      }
    );

    const obj = await Parse.Server.database.find(
      '_User',
      { objectId: user.id },
      {},
      Auth.maintenance(Parse.Server)
    );
    const token = obj[0]._email_verify_token;

    const res = await request({
      url: `http://localhost:8378/1/apps/test/verify_email?token=${token}`,
      method: 'GET',
    });
    expect(res.text).toEqual(
      `Found. Redirecting to http://localhost:8378/1/apps/invalid_verification_link.html?appId=test&token=${token}`
    );

    const formUrl = `http://localhost:8378/1/apps/test/resend_verification_email`;
    const formResponse = await request({
      url: formUrl,
      method: 'POST',
      body: {
        token: token,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      followRedirects: false,
    });
    expect(formResponse.text).toEqual(
      `Found. Redirecting to http://localhost:8378/1/apps/link_send_success.html`
    );
  });

  it_id('9365c53c-b8b4-41f7-a3c1-77882f76a89c')(it)('can conditionally send emails', async () => {
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const verifyUserEmails = {
      method(req) {
        expect(Object.keys(req)).toEqual(['original', 'object', 'master', 'ip', 'installationId']);
        return false;
      },
    };
    const verifySpy = spyOn(verifyUserEmails, 'method').and.callThrough();
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: verifyUserEmails.method,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    const beforeSave = {
      method(req) {
        req.object.set('emailVerified', true);
      },
    };
    const saveSpy = spyOn(beforeSave, 'method').and.callThrough();
    const emailSpy = spyOn(emailAdapter, 'sendVerificationEmail').and.callThrough();
    Parse.Cloud.beforeSave(Parse.User, beforeSave.method);
    const user = new Parse.User();
    user.setUsername('sets_email_verify_token_expires_at');
    user.setPassword('expiringToken');
    user.set('email', 'user@example.com');
    await user.signUp();

    const config = Config.get('test');
    const results = await config.database.find(
      '_User',
      {
        username: 'sets_email_verify_token_expires_at',
      },
      {},
      Auth.maintenance(config)
    );

    expect(results.length).toBe(1);
    const user_data = results[0];
    expect(typeof user_data).toBe('object');
    expect(user_data.emailVerified).toEqual(true);
    expect(user_data._email_verify_token).toBeUndefined();
    expect(user_data._email_verify_token_expires_at).toBeUndefined();
    expect(emailSpy).not.toHaveBeenCalled();
    expect(saveSpy).toHaveBeenCalled();
    expect(sendEmailOptions).toBeUndefined();
    expect(verifySpy).toHaveBeenCalled();
  });

  it_id('b3549300-bed7-4a5e-bed5-792dbfead960')(it)('can conditionally send emails and allow conditional login', async () => {
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const verifyUserEmails = {
      method(req) {
        expect(Object.keys(req)).toEqual(['original', 'object', 'master', 'ip', 'installationId']);
        if (req.object.get('username') === 'no_email') {
          return false;
        }
        return true;
      },
    };
    const verifySpy = spyOn(verifyUserEmails, 'method').and.callThrough();
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: verifyUserEmails.method,
      preventLoginWithUnverifiedEmail: verifyUserEmails.method,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    const user = new Parse.User();
    user.setUsername('no_email');
    user.setPassword('expiringToken');
    user.set('email', 'user@example.com');
    await user.signUp();
    expect(sendEmailOptions).toBeUndefined();
    expect(user.getSessionToken()).toBeDefined();
    expect(verifySpy).toHaveBeenCalledTimes(2);
    const user2 = new Parse.User();
    user2.setUsername('email');
    user2.setPassword('expiringToken');
    user2.set('email', 'user2@example.com');
    await user2.signUp();
    await sendPromise;
    expect(user2.getSessionToken()).toBeUndefined();
    expect(sendEmailOptions).toBeDefined();
    expect(verifySpy).toHaveBeenCalledTimes(5);
  });

  it_id('d812de87-33d1-495e-a6e8-3485f6dc3589')(it)('can conditionally send user email verification', async () => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const sendVerificationEmail = {
      method(req) {
        expect(req.user).toBeDefined();
        expect(req.master).toBeDefined();
        return false;
      },
    };
    const sendSpy = spyOn(sendVerificationEmail, 'method').and.callThrough();
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
      sendUserEmailVerification: sendVerificationEmail.method,
    });
    const emailSpy = spyOn(emailAdapter, 'sendVerificationEmail').and.callThrough();
    const newUser = new Parse.User();
    newUser.setUsername('unsets_email_verify_token_expires_at');
    newUser.setPassword('expiringToken');
    newUser.set('email', 'user@example.com');
    await newUser.signUp();
    await Parse.User.requestEmailVerification('user@example.com');
    await sleep(100);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(emailSpy).toHaveBeenCalledTimes(0);
  });

  it_id('d98babc1-feb8-4b5e-916c-57dc0a6ed9fb')(it)('provides full user object in email verification function on email and username change', async () => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const sendVerificationEmail = {
      method(req) {
        expect(req.user).toBeDefined();
        expect(req.user.id).toBeDefined();
        expect(req.user.get('createdAt')).toBeDefined();
        expect(req.user.get('updatedAt')).toBeDefined();
        expect(req.master).toBeDefined();
        return false;
      },
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5,
      publicServerURL: 'http://localhost:8378/1',
      sendUserEmailVerification: sendVerificationEmail.method,
    });
    const user = new Parse.User();
    user.setPassword('password');
    user.setUsername('new@example.com');
    user.setEmail('user@example.com');
    await user.save(null, { useMasterKey: true });

    // Update email and username
    user.setUsername('new@example.com');
    user.setEmail('new@example.com');
    await user.save(null, { useMasterKey: true });
  });

  it_id('a8c1f820-822f-4a37-9d08-a968cac8369d')(it)('beforeSave options do not change existing behaviour', async () => {
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    const emailSpy = spyOn(emailAdapter, 'sendVerificationEmail').and.callThrough();
    const newUser = new Parse.User();
    newUser.setUsername('unsets_email_verify_token_expires_at');
    newUser.setPassword('expiringToken');
    newUser.set('email', 'user@parse.com');
    await newUser.signUp();
    await sendPromise;
    const response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    const config = Config.get('test');
    const results = await config.database.find('_User', {
      username: 'unsets_email_verify_token_expires_at',
    });

    expect(results.length).toBe(1);
    const user = results[0];
    expect(typeof user).toBe('object');
    expect(user.emailVerified).toEqual(true);
    expect(typeof user._email_verify_token).toBe('undefined');
    expect(typeof user._email_verify_token_expires_at).toBe('undefined');
    expect(emailSpy).toHaveBeenCalled();
  });

  it_id('36d277eb-ec7c-4a39-9108-435b68228741')(it)('unsets the _email_verify_token_expires_at and _email_verify_token fields in the User class if email verification is successful', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('unsets_email_verify_token_expires_at');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    const response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    const config = Config.get('test');
    const results = await config.database.find('_User', {
      username: 'unsets_email_verify_token_expires_at',
    });
    expect(results.length).toBe(1);
    const verifiedUser = results[0];

    expect(typeof verifiedUser).toBe('object');
    expect(verifiedUser.emailVerified).toEqual(true);
    expect(typeof verifiedUser._email_verify_token).toBe('undefined');
    expect(typeof verifiedUser._email_verify_token_expires_at).toBe('undefined');
  });

  it_id('4f444704-ec4b-4dff-b947-614b1c6971c4')(it)('clicking on the email verify link by an email VERIFIED user that was setup before enabling the expire email verify token should show email verify email success', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    };

    // setup server WITHOUT enabling the expire email verify token flag
    await reconfigureServer(serverConfig);
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    let response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    await user.fetch();
    expect(user.get('emailVerified')).toEqual(true);
    // RECONFIGURE the server i.e., ENABLE the expire email verify token flag
    serverConfig.emailVerifyTokenValidityDuration = 5; // 5 seconds
    await reconfigureServer(serverConfig);

    response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    const url = new URL(sendEmailOptions.link);
    const token = url.searchParams.get('token');
    expect(response.text).toEqual(
      `Found. Redirecting to http://localhost:8378/1/apps/invalid_verification_link.html?appId=test&token=${token}`
    );
  });

  it('clicking on the email verify link by an email UNVERIFIED user that was setup before enabling the expire email verify token should show invalid verficiation link page', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    };

    // setup server WITHOUT enabling the expire email verify token flag
    await reconfigureServer(serverConfig);
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    // just get the user again - DO NOT email verify the user
    await user.fetch();

    expect(user.get('emailVerified')).toEqual(false);
    // RECONFIGURE the server i.e., ENABLE the expire email verify token flag
    serverConfig.emailVerifyTokenValidityDuration = 5; // 5 seconds
    await reconfigureServer(serverConfig);

    const response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    const url = new URL(sendEmailOptions.link);
    const token = url.searchParams.get('token');
    expect(response.text).toEqual(
      `Found. Redirecting to http://localhost:8378/1/apps/invalid_verification_link.html?appId=test&token=${token}`
    );
  });

  it_id('b6c87f35-d887-477d-bc86-a9217a424f53')(it)('setting the email on the user should set a new email verification token and new expiration date for the token when expire email verify token flag is set', async () => {
    const user = new Parse.User();
    let userBeforeEmailReset;

    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    const serverConfig = {
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    };

    await reconfigureServer(serverConfig);
    user.setUsername('newEmailVerifyTokenOnEmailReset');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    const config = Config.get('test');
    const userFromDb = await config.database
      .find('_User', { username: 'newEmailVerifyTokenOnEmailReset' })
      .then(results => {
        return results[0];
      });
    expect(typeof userFromDb).toBe('object');
    userBeforeEmailReset = userFromDb;

    // trigger another token generation by setting the email
    user.set('email', 'user@parse.com');
    await new Promise(resolve => {
      // wait for half a sec to get a new expiration time
      setTimeout(() => resolve(user.save()), 500);
    });
    const userAfterEmailReset = await config.database
      .find(
        '_User',
        { username: 'newEmailVerifyTokenOnEmailReset' },
        {},
        Auth.maintenance(config)
      )
      .then(results => {
        return results[0];
      });

    expect(typeof userAfterEmailReset).toBe('object');
    expect(userBeforeEmailReset._email_verify_token).not.toEqual(
      userAfterEmailReset._email_verify_token
    );
    expect(userBeforeEmailReset._email_verify_token_expires_at).not.toEqual(
      userAfterEmailReset._email_verify_token_expires_at
    );
    expect(sendEmailOptions).toBeDefined();
  });

  it_id('28f2140d-48bd-44ac-a141-ba60ea8d9713')(it)('should send a new verification email when a resend is requested and the user is UNVERIFIED', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    let userBeforeRequest;
    const promise1 = resolvingPromise();
    const promise2 = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
        if (sendVerificationEmailCallCount === 1) {
          promise1.resolve();
        } else {
          promise2.resolve();
        }
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('resends_verification_token');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await promise1;
    const config = Config.get('test');
    const newUser = await config.database
      .find('_User', { username: 'resends_verification_token' })
      .then(results => {
        return results[0];
      });
    // store this user before we make our email request
    userBeforeRequest = newUser;

    expect(sendVerificationEmailCallCount).toBe(1);

    const response = await request({
      url: 'http://localhost:8378/1/verificationEmailRequest',
      method: 'POST',
      body: {
        email: 'user@parse.com',
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    });
    expect(response.status).toBe(200);
    await promise2;
    expect(sendVerificationEmailCallCount).toBe(2);
    expect(sendEmailOptions).toBeDefined();

    // query for this user again
    const userAfterRequest = await config.database
      .find('_User', { username: 'resends_verification_token' }, {}, Auth.maintenance(config))
      .then(results => {
        return results[0];
      });
    // verify that our token & expiration has been changed for this new request
    expect(typeof userAfterRequest).toBe('object');
    expect(userBeforeRequest._email_verify_token).not.toEqual(
      userAfterRequest._email_verify_token
    );
    expect(userBeforeRequest._email_verify_token_expires_at).not.toEqual(
      userAfterRequest._email_verify_token_expires_at
    );
  });

  it('provides function arguments in verifyUserEmails on verificationEmailRequest', async () => {
    const user = new Parse.User();
    user.setUsername('user');
    user.setPassword('pass');
    user.set('email', 'test@example.com');
    await user.signUp();

    const verifyUserEmails = {
      method: async (params) => {
        expect(params.object).toBeInstanceOf(Parse.User);
        expect(params.ip).toBeDefined();
        expect(params.master).toBeDefined();
        expect(params.installationId).toBeDefined();
        expect(params.resendRequest).toBeTrue();
        return true;
      },
    };
    const verifyUserEmailsSpy = spyOn(verifyUserEmails, 'method').and.callThrough();
    await reconfigureServer({
      appName: 'test',
      publicServerURL: 'http://localhost:1337/1',
      verifyUserEmails: verifyUserEmails.method,
      preventLoginWithUnverifiedEmail: verifyUserEmails.method,
      preventSignupWithUnverifiedEmail: true,
      emailAdapter: MockEmailAdapterWithOptions({
        fromAddress: 'parse@example.com',
        apiKey: 'k',
        domain: 'd',
      }),
    });

    await expectAsync(Parse.User.requestEmailVerification('test@example.com')).toBeResolved();
    expect(verifyUserEmailsSpy).toHaveBeenCalledTimes(1);
  });

  it('should throw with invalid emailVerifyTokenReuseIfValid', async () => {
    const sendEmailOptions = [];
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        sendEmailOptions.push(options);
      },
      sendMail: () => {},
    };
    try {
      await reconfigureServer({
        appName: 'passwordPolicy',
        verifyUserEmails: true,
        emailAdapter: emailAdapter,
        emailVerifyTokenValidityDuration: 5 * 60, // 5 minutes
        emailVerifyTokenReuseIfValid: [],
        publicServerURL: 'http://localhost:8378/1',
      });
      fail('should have thrown.');
    } catch (e) {
      expect(e).toBe('emailVerifyTokenReuseIfValid must be a boolean value');
    }
    try {
      await reconfigureServer({
        appName: 'passwordPolicy',
        verifyUserEmails: true,
        emailAdapter: emailAdapter,
        emailVerifyTokenReuseIfValid: true,
        publicServerURL: 'http://localhost:8378/1',
      });
      fail('should have thrown.');
    } catch (e) {
      expect(e).toBe(
        'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration'
      );
    }
  });

  it_id('0e66b7f6-2c07-4117-a8b9-605aa31a1e29')(it)('should match codes with emailVerifyTokenReuseIfValid', async () => {
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const promise1 = resolvingPromise();
    const promise2 = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
        if (sendVerificationEmailCallCount === 1) {
          promise1.resolve();
        } else {
          promise2.resolve();
        }
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5 * 60, // 5 minutes
      publicServerURL: 'http://localhost:8378/1',
      emailVerifyTokenReuseIfValid: true,
    });
    const user = new Parse.User();
    user.setUsername('resends_verification_token');
    user.setPassword('expiringToken');
    user.set('email', 'user@example.com');
    await user.signUp();
    await promise1;
    const config = Config.get('test');
    const [userBeforeRequest] = await config.database.find('_User', {
      username: 'resends_verification_token',
    }, {}, Auth.maintenance(config));
    // store this user before we make our email request
    expect(sendVerificationEmailCallCount).toBe(1);
    await new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, 1000);
    });
    const response = await request({
      url: 'http://localhost:8378/1/verificationEmailRequest',
      method: 'POST',
      body: {
        email: 'user@example.com',
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    });
    await promise2;
    expect(response.status).toBe(200);
    expect(sendVerificationEmailCallCount).toBe(2);
    expect(sendEmailOptions).toBeDefined();

    const [userAfterRequest] = await config.database.find('_User', {
      username: 'resends_verification_token',
    }, {}, Auth.maintenance(config));

    // Verify that token & expiration haven't been changed for this new request
    expect(typeof userAfterRequest).toBe('object');
    expect(userBeforeRequest._email_verify_token).toBeDefined();
    expect(userBeforeRequest._email_verify_token).toEqual(userAfterRequest._email_verify_token);
    expect(userBeforeRequest._email_verify_token_expires_at).toBeDefined();
    expect(userBeforeRequest._email_verify_token_expires_at).toEqual(userAfterRequest._email_verify_token_expires_at);
  });

  it_id('1ed9a6c2-bebc-4813-af30-4f4a212544c2')(it)('should not send a new verification email when a resend is requested and the user is VERIFIED', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('no_new_verification_token_once_verified');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    let response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    expect(sendVerificationEmailCallCount).toBe(1);

    response = await request({
      url: 'http://localhost:8378/1/verificationEmailRequest',
      method: 'POST',
      body: {
        email: 'user@parse.com',
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    }).then(fail, res => res);
    expect(response.status).toBe(400);
    expect(sendVerificationEmailCallCount).toBe(1);
  });

  it('should not send a new verification email if this user does not exist', async () => {
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    const response = await request({
      url: 'http://localhost:8378/1/verificationEmailRequest',
      method: 'POST',
      body: {
        email: 'user@parse.com',
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    })
      .then(fail)
      .catch(response => response);
      
    expect(response.status).toBe(400);
    expect(sendVerificationEmailCallCount).toBe(0);
    expect(sendEmailOptions).not.toBeDefined();
  });

  it('should fail if no email is supplied', async () => {
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    const response = await request({
      url: 'http://localhost:8378/1/verificationEmailRequest',
      method: 'POST',
      body: {},
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    }).then(fail, response => response);
    expect(response.status).toBe(400);
    expect(response.data.code).toBe(Parse.Error.EMAIL_MISSING);
    expect(response.data.error).toBe('you must provide an email');
    expect(sendVerificationEmailCallCount).toBe(0);
    expect(sendEmailOptions).not.toBeDefined();
  });

  it('should fail if email is not a string', async () => {
    let sendEmailOptions;
    let sendVerificationEmailCallCount = 0;
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendVerificationEmailCallCount++;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    const response = await request({
      url: 'http://localhost:8378/1/verificationEmailRequest',
      method: 'POST',
      body: { email: 3 },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
    }).then(fail, res => res);
    expect(response.status).toBe(400);
    expect(response.data.code).toBe(Parse.Error.INVALID_EMAIL_ADDRESS);
    expect(response.data.error).toBe('you must provide a valid email string');
    expect(sendVerificationEmailCallCount).toBe(0);
    expect(sendEmailOptions).not.toBeDefined();
  });

  it('client should not see the _email_verify_token_expires_at field', async () => {
    const user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    await user.fetch();
    expect(user.get('emailVerified')).toEqual(false);
    expect(typeof user.get('_email_verify_token_expires_at')).toBe('undefined');
    expect(sendEmailOptions).toBeDefined();
  });

  it_id('b082d387-4974-4d45-a0d9-0c85ca2d7cbf')(it)('emailVerified should be set to false after changing from an already verified email', async () => {
    let user = new Parse.User();
    let sendEmailOptions;
    const sendPromise = resolvingPromise();
    const emailAdapter = {
      sendVerificationEmail: options => {
        sendEmailOptions = options;
        sendPromise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };
    await reconfigureServer({
      appName: 'emailVerifyToken',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 5, // 5 seconds
      publicServerURL: 'http://localhost:8378/1',
    });
    user.setUsername('testEmailVerifyTokenValidity');
    user.setPassword('expiringToken');
    user.set('email', 'user@parse.com');
    await user.signUp();
    await sendPromise;
    let response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
    user = await Parse.User.logIn('testEmailVerifyTokenValidity', 'expiringToken');
    expect(typeof user).toBe('object');
    expect(user.get('emailVerified')).toBe(true);

    user.set('email', 'newEmail@parse.com');
    await user.save();
    await user.fetch();
    expect(typeof user).toBe('object');
    expect(user.get('email')).toBe('newEmail@parse.com');
    expect(user.get('emailVerified')).toBe(false);

    response = await request({
      url: sendEmailOptions.link,
      followRedirects: false,
    });
    expect(response.status).toEqual(302);
  });
});
