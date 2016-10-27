'use strict';
var LoggerController = require('../src/Controllers/LoggerController').LoggerController;
var WinstonLoggerAdapter = require('../src/Adapters/Logger/WinstonLoggerAdapter').WinstonLoggerAdapter;

const fs = require('fs');
const loremFile = __dirname + '/support/lorem.txt';

describe("Cloud Code Logger", () => {
    let user;

    beforeEach(done => {
        Parse.User.enableUnsafeCurrentUser();
        return reconfigureServer({
            // useful to flip to false for fine tuning :).
            silent: true,
        }).then(() => {
            return Parse.User.signUp('tester', 'abc')
                .then(loggedInUser => user = loggedInUser)
                .then(() => Parse.User.logIn(user.get('username'), 'abc'))
                .then(() => done())
        });
    });

    // Note that helpers takes care of logout.
    // see helpers.js:afterEach

    it("should expose log to functions", done => {
        var logController = new LoggerController(new WinstonLoggerAdapter());

        Parse.Cloud.define("loggerTest", (req, res) => {
            req.log.info('logTest', 'info log', { info: 'some log' });
            req.log.error('logTest', 'error log', { error: 'there was an error' });
            res.success({});
        });

        Parse.Cloud.run('loggerTest').then(() => {
            return logController.getLogs({ from: Date.now() - 500, size: 1000 });
        }).then((res) => {
            expect(res.length).not.toBe(0);
            let lastLogs = res.slice(0, 3);
            let cloudFunctionMessage = lastLogs[0];
            let errorMessage = lastLogs[1];
            let infoMessage = lastLogs[2];
            expect(cloudFunctionMessage.level).toBe('info');
            expect(cloudFunctionMessage.params).toEqual({});
            expect(cloudFunctionMessage.message).toMatch(/Ran cloud function loggerTest for user [^ ]* with:\n  Input: {}\n  Result: {}/);
            expect(cloudFunctionMessage.functionName).toEqual('loggerTest');
            expect(errorMessage.level).toBe('error');
            expect(errorMessage.error).toBe('there was an error');
            expect(errorMessage.message).toBe('logTest error log');
            expect(infoMessage.level).toBe('info');
            expect(infoMessage.info).toBe('some log');
            expect(infoMessage.message).toBe('logTest info log');
            done();
        });
    });

    it('trigger should obfuscate password', done => {
        const logController = new LoggerController(new WinstonLoggerAdapter());

        Parse.Cloud.beforeSave(Parse.User, (req, res) => {
            res.success(req.object);
        });

        Parse.User.signUp('tester123', 'abc')
            .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
            .then((res) => {
                const entry = res[0];
                expect(entry.message).not.toMatch(/password":"abc/);
                expect(entry.message).toMatch(/\*\*\*\*\*\*\*\*/);
                done();
            })
            .then(null, e => done.fail(e));
    });

    it("should expose log to trigger", (done) => {
        var logController = new LoggerController(new WinstonLoggerAdapter());

        Parse.Cloud.beforeSave("MyObject", (req, res) => {
            req.log.info('beforeSave MyObject', 'info log', { info: 'some log' });
            req.log.error('beforeSave MyObject', 'error log', { error: 'there was an error' });
            res.success({});
        });

        let obj = new Parse.Object('MyObject');
        obj.save().then(() => {
            return logController.getLogs({ from: Date.now() - 500, size: 1000 })
        }).then((res) => {
            expect(res.length).not.toBe(0);
            let lastLogs = res.slice(0, 3);
            let cloudTriggerMessage = lastLogs[0];
            let errorMessage = lastLogs[1];
            let infoMessage = lastLogs[2];
            expect(cloudTriggerMessage.level).toBe('info');
            expect(cloudTriggerMessage.triggerType).toEqual('beforeSave');
            expect(cloudTriggerMessage.message).toMatch(/beforeSave triggered for MyObject for user [^ ]*\n  Input: {}\n  Result: {}/);
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
        Parse.Cloud.define('aFunction', (req, res) => {
            res.success(req.params);
        });

        Parse.Cloud.run('aFunction', { longString })
            .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
            .then(logs => {
               const log = logs[0];
               expect(log.level).toEqual('info');
               expect(log.message).toMatch(
                   /Ran cloud function aFunction for user [^ ]* with:\n  Input: {.*?\(truncated\)$/m);
                done();
            })
            .then(null, e => done.fail(e));
    });

    it('should log an afterSave', done => {
        const logController = new LoggerController(new WinstonLoggerAdapter());
        Parse.Cloud.afterSave("MyObject", (req) => { });
        new Parse.Object('MyObject')
            .save()
            .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
            .then((logs) => {
                const log = logs[0];
                expect(log.triggerType).toEqual('afterSave');
                done();
            })
            // catch errors - not that the error is actually useful :(
            .then(null, e => done.fail(e));
    });

    it('should log a denied beforeSave', done => {
        const logController = new LoggerController(new WinstonLoggerAdapter());
        Parse.Cloud.beforeSave("MyObject", (req, res) => {
            res.error('uh oh!');
         });

        new Parse.Object('MyObject')
            .save()
            .then(
                () => done.fail('this is not supposed to succeed'),
                e => logController.getLogs({ from: Date.now() - 500, size: 1000 })
            )
            .then(logs => {
                const log = logs[1]; // 0 is the 'uh oh!' from rejection...
                expect(log.level).toEqual('error');
                expect(log.error).toEqual({ code: 141, message: 'uh oh!' });
                done()
            });
    });

    it('should log cloud function success', done => {
        const logController = new LoggerController(new WinstonLoggerAdapter());

        Parse.Cloud.define('aFunction', (req, res) => {
            res.success('it worked!');
        });

        Parse.Cloud.run('aFunction', { foo: 'bar' })
            .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
            .then(logs => {
                const log = logs[0];
                expect(log.level).toEqual('info');
                expect(log.message).toMatch(
                    /Ran cloud function aFunction for user [^ ]* with:\n  Input: {"foo":"bar"}\n  Result: "it worked!/);
                done();
            });
    });

    it('should log cloud function failure', done => {
        const logController = new LoggerController(new WinstonLoggerAdapter());

        Parse.Cloud.define('aFunction', (req, res) => {
            res.error('it failed!');
        });

        Parse.Cloud.run('aFunction', { foo: 'bar' })
            .then(null, () => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
            .then(logs => {
                const log = logs[1];
                expect(log.level).toEqual('error');
                expect(log.message).toMatch(
                    /Failed running cloud function aFunction for user [^ ]* with:\n  Input: {"foo":"bar"}\n  Error: {"code":141,"message":"it failed!"}/);
                done();
            });
    });

    xit('should log a changed beforeSave indicating a change', done => {
        const logController = new LoggerController(new WinstonLoggerAdapter());

        Parse.Cloud.beforeSave("MyObject", (req, res) => {
            const myObj = req.object;
            myObj.set('aChange', true);
            res.success(myObj);
        });

        new Parse.Object('MyObject')
            .save()
            .then(() => logController.getLogs({ from: Date.now() - 500, size: 1000 }))
            .then(logs => {
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
});
