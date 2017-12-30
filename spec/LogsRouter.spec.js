'use strict';

const request = require('request');
var LogsRouter = require('../src/Routers/LogsRouter').LogsRouter;
var LoggerController = require('../src/Controllers/LoggerController').LoggerController;
var WinstonLoggerAdapter = require('../src/Adapters/Logger/WinstonLoggerAdapter').WinstonLoggerAdapter;

const loggerController = new LoggerController(new WinstonLoggerAdapter());

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

  const headers = {
    'X-Parse-Application-Id': 'test',
    'X-Parse-REST-API-Key': 'rest',
    'X-Parse-Master-Key': 'test'
  };

  /**
   * Verifies simple passwords in GET login requests with special characters are scrubbed from the verbose log
   */
  it('does scrub simple passwords on GET login', done => {
    reconfigureServer({
      verbose: true
    }).then(function() {
      request.get({
        headers: headers,
        url: 'http://localhost:8378/1/login?username=test&password=simplepass.com'
      }, () => {
        request.get({
          url: 'http://localhost:8378/1/scriptlog?size=4&level=verbose',
          json: true,
          headers: headers
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(200);
          // 4th entry is our actual GET request
          expect(body[3].url).toEqual('/1/login?username=test&password=********');
          expect(body[3].message).toEqual('REQUEST for [GET] /1/login?username=test&password=********: {}');
          done();
        });
      });
    });
  });

  /**
   * Verifies complex passwords in GET login requests with special characters are scrubbed from the verbose log
   */
  it('does scrub complex passwords on GET login', done => {
    reconfigureServer({
      verbose: true
    }).then(function() {
      request.get({
        headers: headers,
        // using urlencoded password, 'simple @,/?:&=+$#pass.com'
        url: 'http://localhost:8378/1/login?username=test&password=simple%20%40%2C%2F%3F%3A%26%3D%2B%24%23pass.com'
      }, () => {
        request.get({
          url: 'http://localhost:8378/1/scriptlog?size=4&level=verbose',
          json: true,
          headers: headers
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(200);
          // 4th entry is our actual GET request
          expect(body[3].url).toEqual('/1/login?username=test&password=********');
          expect(body[3].message).toEqual('REQUEST for [GET] /1/login?username=test&password=********: {}');
          done();
        });
      });
    });
  });

  /**
   * Verifies fields in POST login requests are NOT present in the verbose log
   */
  it('does not have password field in POST login', done => {
    reconfigureServer({
      verbose: true
    }).then(function() {
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/login',
        data: {
          username: 'test',
          password: 'simplepass.com'
        }
      }, () => {
        request.get({
          url: 'http://localhost:8378/1/scriptlog?size=4&level=verbose',
          json: true,
          headers: headers
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(200);
          // 4th entry is our actual GET request
          expect(body[3].url).toEqual('/1/login');
          expect(body[3].message).toEqual('REQUEST for [POST] /1/login: {}');
          done();
        });
      });
    });
  });
});
