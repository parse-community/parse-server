var LoggerController = require('../src/Controllers/LoggerController').LoggerController;
var FileLoggerAdapter = require('../src/Adapters/Logger/FileLoggerAdapter').FileLoggerAdapter;

describe('LoggerController', () => {
  it('can check valid master key of request', (done) => {
    // Make mock request
    var request = {
      auth: {
        isMaster: true
      },
      query: {}
    };

    var loggerController = new LoggerController(new FileLoggerAdapter());

    expect(() => {
      loggerController.handleGET(request);
    }).not.toThrow();
    done();
  });

  it('can check invalid construction of controller', (done) => {
    // Make mock request
    var request = {
      auth: {
        isMaster: true
      },
      query: {}
    };

    var loggerController = new LoggerController();

    expect(() => {
      loggerController.handleGET(request);
    }).toThrow();
    done();
  });

  it('can check invalid master key of request', (done) => {
    // Make mock request
    var request = {
      auth: {
        isMaster: false
      },
      query: {}
    };

    var loggerController = new LoggerController(new FileLoggerAdapter());

    expect(() => {
      loggerController.handleGET(request);
    }).toThrow();
    done();
  });
});
