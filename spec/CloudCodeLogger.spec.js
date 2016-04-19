'use strict';
var LoggerController = require('../src/Controllers/LoggerController').LoggerController;
var FileLoggerAdapter = require('../src/Adapters/Logger/FileLoggerAdapter').FileLoggerAdapter;

var clearLogs = require('../src/logger').clearLogs;
var loggerController = new LoggerController(new FileLoggerAdapter());

describe("Cloud Code Logger", () => {
  beforeAll(() => {
    clearLogs();
  });
  
  afterAll(() => {
    clearLogs();
  });

  it("should expose log to functions", (done) => {
     Parse.Cloud.define("loggerTest", (req, res) => {
       req.logger.info('loggerTest', 'info log', { info: 'some log' });
       req.logger.error('loggerTest','error log', {error: 'there was an error'});
       res.success({});
     }); 
     
     Parse.Cloud.run('loggerTest').then(() => {
       Parse.Cloud._removeHook('Functions', 'loggerTest');
       return loggerController.getLogs({})
     }).then((res) => {
       expect(res.length).not.toBe(0);
       let lastLogs = res.slice(0, 2);
       let errorMessage = lastLogs[0];
       let infoMessage = lastLogs[1];
       expect(errorMessage.level).toBe('error');
       expect(errorMessage.error).toBe('there was an error');
       expect(errorMessage.message).toBe('loggerTest error log');
       expect(infoMessage.level).toBe('info');
       expect(infoMessage.info).toBe('some log');
       expect(infoMessage.message).toBe('loggerTest info log');
       done();
     });
  });

  it("should expose log to trigger", (done) => {
     Parse.Cloud.beforeSave("MyObject", (req, res) => {
       req.logger.info('beforeSave MyObject', 'info log', { info: 'some log' });
       req.logger.error('beforeSave MyObject','error log', {error: 'there was an error'});
       res.success({});
     }); 
     let obj = new Parse.Object('MyObject')
     obj.save().then(() => {
       Parse.Cloud._removeHook('Triggers', 'beforeSave', 'MyObject');
       return loggerController.getLogs({})
     }).then((res) => {
       expect(res.length).not.toBe(0);
       let lastLogs = res.slice(0, 2);
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
