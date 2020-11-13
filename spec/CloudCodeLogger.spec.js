const LoggerController = require('../lib/Controllers/LoggerController').LoggerController;
const WinstonLoggerAdapter = require('../lib/Adapters/Logger/WinstonLoggerAdapter')
  .WinstonLoggerAdapter;
const fs = require('fs');
const Config = require('../lib/Config');

const loremFile = __dirname + '/support/lorem.txt';

describe('Cloud Code Logger', () => {
  let user;
  let spy;
  beforeEach(async () => {
    Parse.User.enableUnsafeCurrentUser();
    return reconfigureServer({
      // useful to flip to false for fine tuning :).
      silent: true,
    })
      .then(() => {
        return Parse.User.signUp('tester', 'abc')
          .catch(() => {})
          .then(loggedInUser => (user = loggedInUser))
          .then(() => Parse.User.logIn(user.get('username'), 'abc'));
      })
      .then(() => {
        spy = spyOn(Config.get('test').loggerController.adapter, 'log').and.callThrough();
      });
  });

  // Note that helpers takes care of logout.
  // see helpers.js:afterEach

  it('should expose log to functions', () => {
    const spy = spyOn(Config.get('test').loggerController, 'log').and.callThrough();
    Parse.Cloud.define('loggerTest', req => {
      req.log.info('logTest', 'info log', { info: 'some log' });
      req.log.error('logTest', 'error log', { error: 'there was an error' });
      return {};
    });

    return Parse.Cloud.run('loggerTest').then(() => {
      expect(spy).toHaveBeenCalledTimes(3);
      const cloudFunctionMessage = spy.calls.all()[2];
      const errorMessage = spy.calls.all()[1];
      const infoMessage = spy.calls.all()[0];
      expect(cloudFunctionMessage.args[0]).toBe('info');
      expect(cloudFunctionMessage.args[1][1].params).toEqual({});
      expect(cloudFunctionMessage.args[1][0]).toMatch(
        /Ran cloud function loggerTest for user [^ ]* with:\n {2}Input: {}\n {2}Result: {}/
      );
      expect(cloudFunctionMessage.args[1][1].functionName).toEqual('loggerTest');
      expect(errorMessage.args[0]).toBe('error');
      expect(errorMessage.args[1][2].error).toBe('there was an error');
      expect(errorMessage.args[1][0]).toBe('logTest');
      expect(errorMessage.args[1][1]).toBe('error log');
      expect(infoMessage.args[0]).toBe('info');
      expect(infoMessage.args[1][2].info).toBe('some log');
      expect(infoMessage.args[1][0]).toBe('logTest');
      expect(infoMessage.args[1][1]).toBe('info log');
    });
  });

  it('trigger should obfuscate password', done => {
    Parse.Cloud.beforeSave(Parse.User, req => {
      return req.object;
    });

    Parse.User.signUp('tester123', 'abc')
      .then(() => {
        const entry = spy.calls.mostRecent().args;
        expect(entry[1]).not.toMatch(/password":"abc/);
        expect(entry[1]).toMatch(/\*\*\*\*\*\*\*\*/);
        done();
      })
      .then(null, e => done.fail(e));
  });

  it('should expose log to trigger', done => {
    Parse.Cloud.beforeSave('MyObject', req => {
      req.log.info('beforeSave MyObject', 'info log', { info: 'some log' });
      req.log.error('beforeSave MyObject', 'error log', {
        error: 'there was an error',
      });
      return {};
    });

    const obj = new Parse.Object('MyObject');
    obj.save().then(() => {
      const lastCalls = spy.calls.all().reverse();
      const cloudTriggerMessage = lastCalls[0].args;
      const errorMessage = lastCalls[1].args;
      const infoMessage = lastCalls[2].args;
      expect(cloudTriggerMessage[0]).toBe('info');
      expect(cloudTriggerMessage[2].triggerType).toEqual('beforeSave');
      expect(cloudTriggerMessage[1]).toMatch(
        /beforeSave triggered for MyObject for user [^ ]*\n {2}Input: {}\n {2}Result: {"object":{}}/
      );
      expect(cloudTriggerMessage[2].user).toBe(user.id);
      expect(errorMessage[0]).toBe('error');
      expect(errorMessage[3].error).toBe('there was an error');
      expect(errorMessage[1] + ' ' + errorMessage[2]).toBe('beforeSave MyObject error log');
      expect(infoMessage[0]).toBe('info');
      expect(infoMessage[3].info).toBe('some log');
      expect(infoMessage[1] + ' ' + infoMessage[2]).toBe('beforeSave MyObject info log');
      done();
    });
  });

  it('should truncate really long lines when asked to', () => {
    const logController = new LoggerController(new WinstonLoggerAdapter());
    const longString = fs.readFileSync(loremFile, 'utf8');
    const truncatedString = logController.truncateLogMessage(longString);
    expect(truncatedString.length).toBe(1015); // truncate length + the string '... (truncated)'
  });

  it('should truncate input and result of long lines', done => {
    const longString = fs.readFileSync(loremFile, 'utf8');
    Parse.Cloud.define('aFunction', req => {
      return req.params;
    });

    Parse.Cloud.run('aFunction', { longString })
      .then(() => {
        const log = spy.calls.mostRecent().args;
        expect(log[0]).toEqual('info');
        expect(log[1]).toMatch(
          /Ran cloud function aFunction for user [^ ]* with:\n {2}Input: {.*?\(truncated\)$/m
        );
        done();
      })
      .then(null, e => done.fail(e));
  });

  it('should log an afterSave', done => {
    Parse.Cloud.afterSave('MyObject', () => {});
    new Parse.Object('MyObject')
      .save()
      .then(() => {
        const log = spy.calls.mostRecent().args;
        expect(log[2].triggerType).toEqual('afterSave');
        done();
      })
      // catch errors - not that the error is actually useful :(
      .then(null, e => done.fail(e));
  });

  it('should log a denied beforeSave', done => {
    Parse.Cloud.beforeSave('MyObject', () => {
      throw 'uh oh!';
    });

    new Parse.Object('MyObject')
      .save()
      .then(
        () => done.fail('this is not supposed to succeed'),
        () => new Promise(resolve => setTimeout(resolve, 100))
      )
      .then(() => {
        const logs = spy.calls.all().reverse();
        const log = logs[1].args; // 0 is the 'uh oh!' from rejection...
        expect(log[0]).toEqual('error');
        const error = log[2].error;
        expect(error instanceof Parse.Error).toBeTruthy();
        expect(error.code).toBe(141);
        expect(error.message).toBe('uh oh!');
        done();
      });
  });

  it('should log cloud function success', done => {
    Parse.Cloud.define('aFunction', () => {
      return 'it worked!';
    });

    Parse.Cloud.run('aFunction', { foo: 'bar' }).then(() => {
      const log = spy.calls.mostRecent().args;
      expect(log[0]).toEqual('info');
      expect(log[1]).toMatch(
        /Ran cloud function aFunction for user [^ ]* with:\n {2}Input: {"foo":"bar"}\n {2}Result: "it worked!/
      );
      done();
    });
  });

  it('should log cloud function failure', done => {
    Parse.Cloud.define('aFunction', () => {
      throw 'it failed!';
    });

    Parse.Cloud.run('aFunction', { foo: 'bar' })
      .catch(() => {})
      .then(() => {
        const logs = spy.calls.all().reverse();
        expect(logs[0].args[1]).toBe('Parse error: ');
        expect(logs[0].args[2].message).toBe('it failed!');

        const log = logs[1].args;
        expect(log[0]).toEqual('error');
        expect(log[1]).toMatch(
          /Failed running cloud function aFunction for user [^ ]* with:\n {2}Input: {"foo":"bar"}\n {2}Error:/
        );
        const errorString = JSON.stringify(new Parse.Error(141, 'it failed!'));
        expect(log[1].indexOf(errorString)).toBeGreaterThan(0);
        done();
      })
      .catch(done.fail);
  });

  xit('should log a changed beforeSave indicating a change', done => {
    const logController = new LoggerController(new WinstonLoggerAdapter());

    Parse.Cloud.beforeSave('MyObject', req => {
      const myObj = req.object;
      myObj.set('aChange', true);
      return myObj;
    });

    new Parse.Object('MyObject')
      .save()
      .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
      .then(() => {
        // expect the log to indicate that it has changed
        /*
                    Here's what it looks like on parse.com...

                    Input: {"original":{"clientVersion":"1","createdAt":"2016-06-02T05:29:08.694Z","image":{"__type":"File","name":"tfss-xxxxxxxx.png","url":"http://files.parsetfss.com/xxxxxxxx.png"},"lastScanDate":{"__type":"Date","iso":"2016-06-02T05:28:58.135Z"},"localIdentifier":"XXXXX","objectId":"OFHMX7ZUcI","status":... (truncated)
                    Result: Update changed to {"object":{"__type":"Pointer","className":"Emoticode","objectId":"ksrq7z3Ehc"},"imageThumb":{"__type":"File","name":"tfss-xxxxxxx.png","url":"http://files.parsetfss.com/xxxxx.png"},"status":"success"}
                */
        done();
      })
      .then(null, e => done.fail(JSON.stringify(e)));
  }).pend('needs more work.....');

  it('cloud function should obfuscate password', done => {
    Parse.Cloud.define('testFunction', () => {
      return 'verify code success';
    });

    Parse.Cloud.run('testFunction', { username: 'hawk', password: '123456' })
      .then(() => {
        const entry = spy.calls.mostRecent().args;
        expect(entry[2].params.password).toMatch(/\*\*\*\*\*\*\*\*/);
        done();
      })
      .then(null, e => done.fail(e));
  });

  it('should only log once for object not found', async () => {
    const config = Config.get('test');
    const spy = spyOn(config.loggerController, 'error').and.callThrough();
    try {
      const object = new Parse.Object('Object');
      object.id = 'invalid';
      await object.fetch();
    } catch (e) {
      /**/
    }
    expect(spy).toHaveBeenCalled();
    expect(spy.calls.count()).toBe(1);
    const { args } = spy.calls.mostRecent();
    expect(args[0]).toBe('Parse error: ');
    expect(args[1].message).toBe('Object not found.');
  });
});
