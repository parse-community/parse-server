'use strict';

const request = require('request');
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
      router.validateRequest(request);
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
      router.validateRequest(request);
    }).toThrow();
    done();
  });

  it('can check invalid master key of request', done => {
    request.get({
      url: 'http://localhost:8378/1/scriptlog',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
      done();
    });
  });
});
