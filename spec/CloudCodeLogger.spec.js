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
      logLevel: undefined,
      logLevels: {
        cloudFunctionError: 'error',
        cloudFunctionSuccess: 'info',
        triggerAfter: 'info',
        triggerBeforeError: 'error',
        triggerBeforeSuccess: 'info',
      },
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

  it_id('02d53b97-3ec7-46fb-abb6-176fd6e85590')(it)('should expose log to functions', () => {
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

  it_id('768412f5-d32f-4134-89a6-08949781a6c0')(it)('trigger should obfuscate password', done => {
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

  it_id('3c394047-272e-4728-9d02-9eaa660d2ed2')(it)('should expose log to trigger', done => {
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

  it_id('4a009b1f-9203-49ca-8d48-5b45f4eedbdf')(it)('should truncate input and result of long lines', done => {
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

  it_id('9857e15d-bb18-478d-8a67-fdaad3e89565')(it)('should log an afterSave', done => {
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

  it_id('ec13a296-f8b1-4fc6-985a-3593462edd9c')(it)('should log a denied beforeSave', done => {
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
        expect(error.code).toBe(Parse.Error.SCRIPT_FAILED);
        expect(error.message).toBe('uh oh!');
        done();
      });
  });

  it_id('3e0caa45-60d6-41af-829a-fd389710c132')(it)('should log cloud function success', done => {
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

  it_id('8088de8a-7cba-4035-8b05-4a903307e674')(it)('should log cloud function execution using the custom log level', async done => {
    Parse.Cloud.define('aFunction', () => {
      return 'it worked!';
    });

    Parse.Cloud.define('bFunction', () => {
      throw new Error('Failed');
    });

    await Parse.Cloud.run('aFunction', { foo: 'bar' }).then(() => {
      const log = spy.calls.allArgs().find(log => log[1].startsWith('Ran cloud function '))?.[0];
      expect(log).toEqual('info');
    });

    await reconfigureServer({
      silent: true,
      logLevels: {
        cloudFunctionSuccess: 'warn',
        cloudFunctionError: 'info',
      },
    });

    spy = spyOn(Config.get('test').loggerController.adapter, 'log').and.callThrough();

    try {
      await Parse.Cloud.run('bFunction', { foo: 'bar' });
      throw new Error('bFunction should have failed');
    } catch {
      const log = spy.calls
        .allArgs()
        .find(log => log[1].startsWith('Failed running cloud function bFunction for '))?.[0];
      expect(log).toEqual('info');
      done();
    }
  });

  it('should log cloud function triggers using the custom log level', async () => {
    Parse.Cloud.beforeSave('TestClass', () => {});
    Parse.Cloud.afterSave('TestClass', () => {});

    const execTest = async (logLevel, triggerBeforeSuccess, triggerAfter) => {
      await reconfigureServer({
        silent: true,
        logLevel,
        logLevels: {
          triggerAfter,
          triggerBeforeSuccess,
        },
      });

      spy = spyOn(Config.get('test').loggerController.adapter, 'log').and.callThrough();
      const obj = new Parse.Object('TestClass');
      await obj.save();

      return {
        beforeSave: spy.calls
          .allArgs()
          .find(log => log[1].startsWith('beforeSave triggered for TestClass for user '))?.[0],
        afterSave: spy.calls
          .allArgs()
          .find(log => log[1].startsWith('afterSave triggered for TestClass for user '))?.[0],
      };
    };

    let calls = await execTest('silly', 'silly', 'debug');
    expect(calls).toEqual({ beforeSave: 'silly', afterSave: 'debug' });

    calls = await execTest('info', 'warn', 'debug');
    expect(calls).toEqual({ beforeSave: 'warn', afterSave: undefined });
  });

  it_id('97e0eafa-cde6-4a9a-9e53-7db98bacbc62')(it)('should log cloud function failure', done => {
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
        const errorString = JSON.stringify(
          new Parse.Error(Parse.Error.SCRIPT_FAILED, 'it failed!')
        );
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

  it_id('b86e8168-8370-4730-a4ba-24ca3016ad66')(it)('cloud function should obfuscate password', done => {
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

  it('should log cloud function execution using the silent log level', async () => {
    await reconfigureServer({
      logLevels: {
        cloudFunctionSuccess: 'silent',
        cloudFunctionError: 'silent',
      },
    });
    Parse.Cloud.define('aFunction', () => {
      return 'it worked!';
    });
    Parse.Cloud.define('bFunction', () => {
      throw new Error('Failed');
    });
    spy = spyOn(Config.get('test').loggerController.adapter, 'log').and.callThrough();

    await Parse.Cloud.run('aFunction', { foo: 'bar' });
    expect(spy).toHaveBeenCalledTimes(0);

    await expectAsync(Parse.Cloud.run('bFunction', { foo: 'bar' })).toBeRejected();
    // Not "Failed running cloud function message..."
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should log cloud function triggers using the silent log level', async () => {
    await reconfigureServer({
      logLevels: {
        triggerAfter: 'silent',
        triggerBeforeSuccess: 'silent',
        triggerBeforeError: 'silent',
      },
    });
    Parse.Cloud.beforeSave('TestClassError', () => {
      throw new Error('Failed');
    });
    Parse.Cloud.beforeSave('TestClass', () => {});
    Parse.Cloud.afterSave('TestClass', () => {});

    spy = spyOn(Config.get('test').loggerController.adapter, 'log').and.callThrough();

    const obj = new Parse.Object('TestClass');
    await obj.save();
    expect(spy).toHaveBeenCalledTimes(0);

    const objError = new Parse.Object('TestClassError');
    await expectAsync(objError.save()).toBeRejected();
    // Not "beforeSave failed for TestClassError for user ..."
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
