const LoggerController = require('../lib/Controllers/LoggerController')
  .LoggerController;
const WinstonLoggerAdapter = require('../lib/Adapters/Logger/WinstonLoggerAdapter')
  .WinstonLoggerAdapter;
const fs = require('fs');
const Config = require('../lib/Config');

const loremFile = __dirname + '/support/lorem.txt';

describe('Cloud Code Logger', () => {
  let user;

  beforeEach(done => {
    Parse.User.enableUnsafeCurrentUser();
    return reconfigureServer({
      // useful to flip to false for fine tuning :).
      silent: true,
    }).then(() => {
      return Parse.User.signUp('tester', 'abc')
        .then(loggedInUser => (user = loggedInUser))
        .then(() => Parse.User.logIn(user.get('username'), 'abc'))
        .then(() => done());
    });
  });

  // Note that helpers takes care of logout.
  // see helpers.js:afterEach

  it('should expose log to functions', () => {
    const config = Config.get('test');
    const spy = spyOn(config.loggerController, 'log').and.callThrough();

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
      expect(cloudFunctionMessage.args[1][1].functionName).toEqual(
        'loggerTest'
      );
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
    const logController = new LoggerController(new WinstonLoggerAdapter());

    Parse.Cloud.beforeSave(Parse.User, req => {
      return req.object;
    });

    Parse.User.signUp('tester123', 'abc')
      .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
      .then(res => {
        const entry = res[0];
        expect(entry.message).not.toMatch(/password":"abc/);
        expect(entry.message).toMatch(/\*\*\*\*\*\*\*\*/);
        done();
      })
      .then(null, e => done.fail(e));
  });

  it('should expose log to trigger', done => {
    const logController = new LoggerController(new WinstonLoggerAdapter());

    Parse.Cloud.beforeSave('MyObject', req => {
      req.log.info('beforeSave MyObject', 'info log', { info: 'some log' });
      req.log.error('beforeSave MyObject', 'error log', {
        error: 'there was an error',
      });
      return {};
    });

    const obj = new Parse.Object('MyObject');
    obj
      .save()
      .then(() => {
        return logController.getLogs({ from: Date.now() - 500, size: 1000 });
      })
      .then(res => {
        expect(res.length).not.toBe(0);
        const lastLogs = res.slice(0, 3);
        const cloudTriggerMessage = lastLogs[0];
        const errorMessage = lastLogs[1];
        const infoMessage = lastLogs[2];
        expect(cloudTriggerMessage.level).toBe('info');
        expect(cloudTriggerMessage.triggerType).toEqual('beforeSave');
        expect(cloudTriggerMessage.message).toMatch(
          /beforeSave triggered for MyObject for user [^ ]*\n {2}Input: {}\n {2}Result: {}/
        );
        expect(cloudTriggerMessage.user).toBe(user.id);
        expect(errorMessage.level).toBe('error');
        expect(errorMessage.error).toBe('there was an error');
        expect(errorMessage.message).toBe('beforeSave MyObject error log');
        expect(infoMessage.level).toBe('info');
        expect(infoMessage.info).toBe('some log');
        expect(infoMessage.message).toBe('beforeSave MyObject info log');
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
    const logController = new LoggerController(new WinstonLoggerAdapter());
    const longString = fs.readFileSync(loremFile, 'utf8');
    Parse.Cloud.define('aFunction', req => {
      return req.params;
    });

    Parse.Cloud.run('aFunction', { longString })
      .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
      .then(logs => {
        const log = logs[0];
        expect(log.level).toEqual('info');
        expect(log.message).toMatch(
          /Ran cloud function aFunction for user [^ ]* with:\n {2}Input: {.*?\(truncated\)$/m
        );
        done();
      })
      .then(null, e => done.fail(e));
  });

  it('should log an afterSave', done => {
    const logController = new LoggerController(new WinstonLoggerAdapter());
    Parse.Cloud.afterSave('MyObject', () => {});
    new Parse.Object('MyObject')
      .save()
      .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
      .then(logs => {
        const log = logs[0];
        expect(log.triggerType).toEqual('afterSave');
        done();
      })
      // catch errors - not that the error is actually useful :(
      .then(null, e => done.fail(e));
  });

  it('should log a denied beforeSave', done => {
    const logController = new LoggerController(new WinstonLoggerAdapter());
    Parse.Cloud.beforeSave('MyObject', () => {
      throw 'uh oh!';
    });

    new Parse.Object('MyObject')
      .save()
      .then(
        () => done.fail('this is not supposed to succeed'),
        () => new Promise(resolve => setTimeout(resolve, 100))
      )
      .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
      .then(logs => {
        const log = logs[1]; // 0 is the 'uh oh!' from rejection...
        expect(log.level).toEqual('error');
        expect(log.error).toEqual({ code: 141, message: 'uh oh!' });
        done();
      });
  });

  it('should log cloud function success', done => {
    const logController = new LoggerController(new WinstonLoggerAdapter());

    Parse.Cloud.define('aFunction', () => {
      return 'it worked!';
    });

    Parse.Cloud.run('aFunction', { foo: 'bar' })
      .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
      .then(logs => {
        const log = logs[0];
        expect(log.level).toEqual('info');
        expect(log.message).toMatch(
          /Ran cloud function aFunction for user [^ ]* with:\n {2}Input: {"foo":"bar"}\n {2}Result: "it worked!/
        );
        done();
      });
  });

  it('should log cloud function failure', done => {
    const logController = new LoggerController(new WinstonLoggerAdapter());

    Parse.Cloud.define('aFunction', () => {
      throw 'it failed!';
    });

    Parse.Cloud.run('aFunction', { foo: 'bar' })
      .then(null, () =>
        logController.getLogs({ from: Date.now() - 500, size: 1000 })
      )
      .then(logs => {
        expect(logs[0].message).toBe('it failed!');
        const log = logs[1];
        expect(log.level).toEqual('error');
        expect(log.message).toMatch(
          /Failed running cloud function aFunction for user [^ ]* with:\n {2}Input: {"foo":"bar"}\n {2}Error: {"code":141,"message":"it failed!"}/
        );
        done();
      });
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
    const logController = new LoggerController(new WinstonLoggerAdapter());

    Parse.Cloud.define('testFunction', () => {
      return 'verify code success';
    });

    Parse.Cloud.run('testFunction', { username: 'hawk', password: '123456' })
      .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
      .then(res => {
        const entry = res[0];
        expect(entry.params.password).toMatch(/\*\*\*\*\*\*\*\*/);
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
    expect(args[0]).toBe('Object not found.');
  });
});
