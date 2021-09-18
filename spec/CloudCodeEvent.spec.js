'use strict';
const Parse = require('parse/node');

describe('Auth events', () => {
  it('cloud event should run when defined', async done => {
    let hit = 0;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.userAuthenticated, request => {
      hit++;
      expect(request.user).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFinished, request => {
      hit++;
      expect(request.user).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFailed, () => {
      hit++;
    });
    await Parse.User.signUp('tupac', 'shakur');
    const user = await Parse.User.logIn('tupac', 'shakur');
    expect(hit).toBe(3);
    expect(user).toBeDefined();
    expect(user.get('username')).toEqual('tupac');
    done();
  });

  it('only loginStarted and loginFailed event should run with failed login attempt', async done => {
    let hit = 0;
    let errorCode;
    let errorMessage;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.userAuthenticated, () => {
      //this shouldn't run
      hit++;
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFinished, () => {
      //this shouldn't run
      hit++;
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFailed, request => {
      hit++;
      expect(request.error).toBeDefined();
      errorCode = request.error.code;
      errorMessage = request.error.message;
    });
    await Parse.User.signUp('tupac', 'shakur');
    Parse.User.logIn('tupac', 'eminem')
      .then(user => {
        expect(user).toBeUndefined();
        done();
      })
      .catch(err => {
        expect(hit).toBe(2);
        expect(err.code).toBe(errorCode);
        expect(err.message).toEqual(errorMessage);
        done();
      });
  });

  it('loginFailed event should modify error message', async done => {
    let hit = 0;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFailed, request => {
      hit++;
      expect(request.error).toBeDefined();
      request.error.code = Parse.Error.INVALID_EMAIL_ADDRESS;
      request.error.message = 'Login with Google!';
      return request.error;
    });
    await Parse.User.signUp('tupac', 'shakur');
    Parse.User.logIn('tupac', 'eminem')
      .then(user => {
        expect(user).toBeUndefined();
        done();
      })
      .catch(err => {
        expect(hit).toBe(2);
        expect(err.code).toBe(Parse.Error.INVALID_EMAIL_ADDRESS);
        expect(err.message).toEqual('Login with Google!');
        done();
      });
  });

  it('loginFailed event should throw different error message', async done => {
    let hit = 0;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFailed, request => {
      hit++;
      expect(request.error).toBeDefined();
      throw new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Login with Google!');
    });
    await Parse.User.signUp('tupac', 'shakur');
    Parse.User.logIn('tupac', 'eminem')
      .then(user => {
        expect(user).toBeUndefined();
        done();
      })
      .catch(err => {
        expect(hit).toBe(2);
        expect(err.code).toBe(Parse.Error.INVALID_EMAIL_ADDRESS);
        expect(err.message).toEqual('Login with Google!');
        done();
      });
  });

  it('loginFailed event should return different error message', async done => {
    let hit = 0;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFailed, request => {
      hit++;
      expect(request.error).toBeDefined();
      return new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Login with Google!');
    });
    await Parse.User.signUp('tupac', 'shakur');
    Parse.User.logIn('tupac', 'eminem')
      .then(user => {
        expect(user).toBeUndefined();
        done();
      })
      .catch(err => {
        expect(hit).toBe(2);
        expect(err.code).toBe(Parse.Error.INVALID_EMAIL_ADDRESS);
        expect(err.message).toEqual('Login with Google!');
        done();
      });
  });
  it('loginFailed event should handle throwing string', async done => {
    let hit = 0;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFailed, request => {
      hit++;
      expect(request.error).toBeDefined();
      throw 'Login with Google!';
    });
    await Parse.User.signUp('tupac', 'shakur');
    Parse.User.logIn('tupac', 'eminem')
      .then(user => {
        expect(user).toBeUndefined();
        done();
      })
      .catch(err => {
        expect(hit).toBe(2);
        expect(err.code).toBe(Parse.Error.SCRIPT_FAILED);
        expect(err.message).toEqual('Login with Google!');
        done();
      });
  });
  it('loginFailed event should handle returning string', async done => {
    let hit = 0;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.loginFailed, request => {
      hit++;
      expect(request.error).toBeDefined();
      return 'Login with Google!';
    });
    await Parse.User.signUp('tupac', 'shakur');
    Parse.User.logIn('tupac', 'eminem')
      .then(user => {
        expect(user).toBeUndefined();
        done();
      })
      .catch(err => {
        expect(hit).toBe(2);
        expect(err.code).toBe(Parse.Error.SCRIPT_FAILED);
        expect(err.message).toEqual('Login with Google!');
        done();
      });
  });

  it('logoutStarted Event should run', async done => {
    let hit = 0;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.logoutStarted, request => {
      hit++;
      expect(request.user.get('username')).toBeDefined();
      expect(request.user.get('username')).toEqual('tupac');
    });

    await Parse.User.signUp('tupac', 'shakur');
    await Parse.User.logIn('tupac', 'shakur');
    await Parse.User.logOut();
    expect(hit).toBe(1);
    done();
  });

  it('logoutStarted should block logout operation if throws an error', async done => {
    let hit = 0;
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.logoutStarted, () => {
      hit++;
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'You cant logout!');
    });

    await Parse.User.signUp('tupac', 'shakur');
    await Parse.User.logIn('tupac', 'shakur');
    Parse.User.logOut().catch(err => {
      expect(hit).toBe(1);
      expect(err.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      expect(err.message).toEqual('You cant logout!');
      done();
    });
  });

  it('logoutFailed should be triggered if logout operation fails', async done => {
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.logoutStarted, () => {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'You cant logout!');
    });

    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.logoutFailed, request => {
      expect(request.error.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      expect(request.error.message).toEqual('You cant logout!');
    });

    await Parse.User.signUp('tupac', 'shakur');
    await Parse.User.logIn('tupac', 'shakur');
    Parse.User.logOut().catch(err => {
      expect(err.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      expect(err.message).toEqual('You cant logout!');
      done();
    });
  });

  it('logoutFailed can modify error', async done => {
    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.logoutStarted, () => {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'You cant logout!');
    });

    Parse.Cloud.onAuthEvent(Parse.Cloud.Events.Auth.logoutFailed, request => {
      expect(request.error.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      expect(request.error.message).toEqual('You cant logout!');
      throw new Parse.Error(999, 'New message. You still cant logout lmao!');
    });

    await Parse.User.signUp('tupac', 'shakur');
    await Parse.User.logIn('tupac', 'shakur');
    Parse.User.logOut().catch(err => {
      expect(err.code).toBe(999);
      expect(err.message).toEqual('New message. You still cant logout lmao!');
      done();
    });
  });
});
