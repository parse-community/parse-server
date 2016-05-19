'use strict';
var LoggerController = require('../src/Controllers/LoggerController').LoggerController;
var FileLoggerAdapter = require('../src/Adapters/Logger/FileLoggerAdapter').FileLoggerAdapter;

describe("Cloud Code Logger", () => {

    it("should expose log to functions", (done) => {
        var logController = new LoggerController(new FileLoggerAdapter());

        Parse.Cloud.define("loggerTest", (req, res) => {
            req.log.info('logTest', 'info log', {info: 'some log' });
            req.log.error('logTest','error log', {error: 'there was an error'});
            res.success({});
        });

        Parse.Cloud.run('loggerTest').then(() => {
            return logController.getLogs({from: Date.now() - 500, size: 1000});
        }).then((res) => {
            expect(res.length).not.toBe(0);
            let lastLogs =  res.slice(0, 2);
            let errorMessage = lastLogs[0];
            let infoMessage = lastLogs[1];
            expect(errorMessage.level).toBe('error');
            expect(errorMessage.error).toBe('there was an error');
            expect(errorMessage.message).toBe('logTest error log');
            expect(infoMessage.level).toBe('info');
            expect(infoMessage.info).toBe('some log');
            expect(infoMessage.message).toBe('logTest info log');
            done();
        });
    });

    it("should expose log to trigger", (done) => {
        var logController = new LoggerController(new FileLoggerAdapter());

        Parse.Cloud.beforeSave("MyObject", (req, res) => {
            req.log.info('beforeSave MyObject', 'info log', {info: 'some log' });
            req.log.error('beforeSave MyObject','error log', {error: 'there was an error'});
            res.success({});
        });

        let obj = new Parse.Object('MyObject');
        obj.save().then(() => {
            return logController.getLogs({from: Date.now() - 500, size: 1000})
        }).then((res) => {
            expect(res.length).not.toBe(0);
            let lastLogs =  res.slice(0, 2);
            let errorMessage = lastLogs[0];
            let infoMessage = lastLogs[1];
            expect(errorMessage.level).toBe('error');
            expect(errorMessage.error).toBe('there was an error');
            expect(errorMessage.message).toBe('beforeSave MyObject error log');
            expect(infoMessage.level).toBe('info');
            expect(infoMessage.info).toBe('some log');
            expect(infoMessage.message).toBe('beforeSave MyObject info log');
            done();
        });
    });
});
