var LogsRouter = require('../src/Routers/LogsRouter').LogsRouter;
var LoggerController = require('../src/Controllers/LoggerController').LoggerController;
var FileLoggerAdapter = require('../src/Adapters/Logger/FileLoggerAdapter').FileLoggerAdapter;

const loggerController = new LoggerController(new FileLoggerAdapter());

describe('LogsRouter', () => {
  it('can check valid master key of request', (done) => {
    // Make mock request
    var request = {
      auth: {
        isMaster: true
      },
      query: {},
      config: {
        loggerController: loggerController
      }
    };

    var router = new LogsRouter();

    expect(() => {
      router.handleGET(request);
    }).not.toThrow();
    done();
  });

  it('can check invalid construction of controller', (done) => {
    // Make mock request
    var request = {
      auth: {
        isMaster: true
      },
      query: {},
      config: {
        loggerController: undefined // missing controller
      }
    };

    var router = new LogsRouter();

    expect(() => {
      router.handleGET(request);
    }).toThrow();
    done();
  });

  it('can check invalid master key of request', (done) => {
    // Make mock request
    var request = {
      auth: {
        isMaster: false
      },
      query: {},
      config: {
        loggerController: loggerController
      }
    };

   var router = new LogsRouter();

    expect(() => {
      router.handleGET(request);
    }).toThrow();
    done();
  });
});
