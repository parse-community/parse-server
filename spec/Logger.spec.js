const logging = require('../lib/Adapters/Logger/WinstonLogger');
const Transport = require('winston-transport');

class TestTransport extends Transport {
  log(info, callback) {
    callback(null, true);
  }
}

describe('WinstonLogger', () => {
  it('should add transport', () => {
    const testTransport = new TestTransport();
    spyOn(testTransport, 'log');
    logging.addTransport(testTransport);
    expect(logging.logger.transports.length).toBe(4);
    logging.logger.info('hi');
    expect(testTransport.log).toHaveBeenCalled();
    logging.logger.error('error');
    expect(testTransport.log).toHaveBeenCalled();
    logging.removeTransport(testTransport);
    expect(logging.logger.transports.length).toBe(3);
  });

  it('should have files transports', done => {
    reconfigureServer().then(() => {
      const transports = logging.logger.transports;
      expect(transports.length).toBe(3);
      done();
    });
  });

  it('should disable files logs', done => {
    reconfigureServer({
      logsFolder: null,
    }).then(() => {
      const transports = logging.logger.transports;
      expect(transports.length).toBe(1);
      done();
    });
  });

  it('should have a timestamp', done => {
    logging.logger.info('hi');
    logging.logger.query({ limit: 1 }, (err, results) => {
      if (err) {
        done.fail(err);
      }
      expect(results['parse-server'][0].timestamp).toBeDefined();
      done();
    });
  });

  it('console should not be json', done => {
    // Force console transport
    reconfigureServer({
      logsFolder: null,
      silent: false,
    })
      .then(() => {
        spyOn(process.stdout, 'write');
        logging.logger.info('hi', { key: 'value' });
        expect(process.stdout.write).toHaveBeenCalled();
        const firstLog = process.stdout.write.calls.first().args[0];
        expect(firstLog).toEqual('info: hi {"key":"value"}' + '\n');
        return reconfigureServer();
      })
      .then(() => {
        done();
      });
  });

  it('should enable JSON logs', done => {
    // Force console transport
    reconfigureServer({
      logsFolder: null,
      jsonLogs: true,
      silent: false,
    })
      .then(() => {
        spyOn(process.stdout, 'write');
        logging.logger.info('hi', { key: 'value' });
        expect(process.stdout.write).toHaveBeenCalled();
        const firstLog = process.stdout.write.calls.first().args[0];
        expect(firstLog).toEqual(
          JSON.stringify({ key: 'value', level: 'info', message: 'hi' }) + '\n'
        );
        return reconfigureServer({
          jsonLogs: false,
        });
      })
      .then(() => {
        done();
      });
  });
});
