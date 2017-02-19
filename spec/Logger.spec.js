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
    expect(Object.keys(logging.logger.transports).length).toBe(4);
    logging.logger.info('hi');
    expect(testTransport.log).toHaveBeenCalled();
    logging.removeTransport(testTransport);
    expect(Object.keys(logging.logger.transports).length).toBe(3);
  });

  it('should have files transports', (done) => {
    reconfigureServer().then(() => {
      const transports = logging.logger.transports;
      const transportKeys = Object.keys(transports);
      expect(transportKeys.length).toBe(3);
      done();
    });
  });

  it('should disable files logs', (done) => {
    reconfigureServer({
      logsFolder: null
    }).then(() => {
      const transports = logging.logger.transports;
      const transportKeys = Object.keys(transports);
      expect(transportKeys.length).toBe(1);
      done();
    });
  });

  it('should enable JSON logs', (done) => {
    // Force console transport
    reconfigureServer({
      logsFolder: null,
      jsonLogs: true,
      silent: false
    }).then(() => {
      spyOn(process.stdout, 'write');
      logging.logger.info('hi', {key: 'value'});
      expect(process.stdout.write).toHaveBeenCalled();
      var firstLog = process.stdout.write.calls.first().args[0];
      expect(firstLog).toEqual(JSON.stringify({key: 'value', level: 'info', message: 'hi' }) + '\n');
      return reconfigureServer({
        jsonLogs: false
      });
    }).then(() => {
      done();
    });
  });
});
