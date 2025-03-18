'use strict';

const { getAuthForSessionToken } = require('../lib/Auth');
const Config = require('../lib/Config');

describe('verifyUserEmails with Auth Context', () => {
  let user;
  let config;

  beforeEach(async (done) => {
    await reconfigureServer({
      verifyUserEmails: jasmine.createSpy('verifyUserEmails'),
    });

    user = new Parse.User();
    await user.signUp({
      username: 'testuser',
      password: 'securepassword',
      email: 'test@example.com',
    });

    config = Config.get('test');
    done();
  });

  it('should call verifyUserEmails with correct auth context on signup', async (done) => {
    const sessionToken = user.getSessionToken();
    expect(sessionToken).toBeDefined();

    await getAuthForSessionToken({
      sessionToken,
      config,
    });

    expect(config.verifyUserEmails).toHaveBeenCalledWith({
      action: 'signup',
      authProvider: 'password',
    });
    done();
  });

  it('should call verifyUserEmails with correct auth context on login', async (done) => {
    await Parse.User.logIn('testuser', 'securepassword');

    expect(config.verifyUserEmails).toHaveBeenCalledWith({
      action: 'login',
      authProvider: 'password',
    });
    done();
  });

  it('should call verifyUserEmails with correct provider for social login', async (done) => {
    const socialAuthData = {
      id: '1234567890',
      access_token: 'mockAccessToken',
    };

    await Parse.User.logInWith('facebook', { authData: socialAuthData });

    expect(config.verifyUserEmails).toHaveBeenCalledWith({
      action: 'login',
      authProvider: 'facebook',
    });
    done();
  });
});
