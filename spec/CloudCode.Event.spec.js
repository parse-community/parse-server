'use strict';
const Parse = require('parse/node');

describe('Login events', () => {
  it('cloud event should run when defined', async done => {
    let hit = 0;
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.userAuthenticated, request => {
      hit++;
      expect(request.user).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFinished, request => {
      hit++;
      expect(request.user).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFailed, () => {
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
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.userAuthenticated, () => {
      //this shouldn't run
      hit++;
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFinished, () => {
      //this shouldn't run
      hit++;
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFailed, request => {
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
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFailed, request => {
      hit++;
      expect(request.error).toBeDefined();
      request.error.code = Parse.Error.INVALID_EMAIL_ADDRESS;
      request.error.message = 'Login with Google!';
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
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFailed, request => {
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
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFailed, request => {
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
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFailed, request => {
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
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginStarted, request => {
      hit++;
      expect(request.credentials.username).toBeDefined();
    });
    Parse.Cloud.Event.addLoginEvent(Parse.Cloud.Event.Login.loginFailed, request => {
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
});
