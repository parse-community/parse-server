var logging = require('../src/Adapters/Logger/WinstonLogger');
var winston = require('winston');

class TestTransport extends winston.Transport {
  log(level, msg, meta, callback) {
    callback(null, true);
  }
}

describe('Logger', () => {
  // Test is excluded as will be refactored
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
});
