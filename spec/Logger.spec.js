var logging = require('../src/Adapters/Logger/WinstonLogger');
var winston = require('winston');

class TestTransport extends winston.Transport {
  log(level, msg, meta, callback) {
    callback(null, true);
  }
}

describe('Logger', () => {
  it('should add transport', () => {
    const testTransport = new (TestTransport)({
      name: 'test'
    });
    spyOn(testTransport, 'log');
    logging.addTransport(testTransport);
    logging.logger.info('hi');
    expect(testTransport.log).toHaveBeenCalled();
    logging.removeTransport(testTransport);
  });

  it('should have files transports', (done) => {
    reconfigureServer().then(() => {
      let transports = logging.logger.transports;
      let transportKeys = Object.keys(transports);
      expect(transportKeys.length).toBe(2);
      done();
    });
  });

  it('should disable files logs', (done) => {
    reconfigureServer({
      logsFolder: null
    }).then(() => {
      let transports = logging.logger.transports;
      let transportKeys = Object.keys(transports);
      expect(transportKeys.length).toBe(0);
      done();
    });
  });

  it('should enable JSON logs', (done) => {
    // Force console transport
    process.env.VERBOSE=1;
    reconfigureServer({
      logsFolder: null,
      jsonLogs: true
    }).then(() => {
      let spy = spyOn(process.stdout, 'write');
      logging.logger.info('hi', {key: 'value'});
      expect(process.stdout.write).toHaveBeenCalled();
      var firstLog = process.stdout.write.calls.first().args[0];
      expect(firstLog).toEqual(JSON.stringify({key: 'value', level: 'info', message: 'hi' })+'\n');
      delete process.env.VERBOSE;
      return reconfigureServer({
        jsonLogs: false
      });
    }).then(() => {
      done();
    });
  });
});
