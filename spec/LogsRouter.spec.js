'use strict';

const request = require('../lib/request');
const LogsRouter = require('../lib/Routers/LogsRouter').LogsRouter;
const LoggerController = require('../lib/Controllers/LoggerController').LoggerController;
const WinstonLoggerAdapter = require('../lib/Adapters/Logger/WinstonLoggerAdapter')
  .WinstonLoggerAdapter;

const loggerController = new LoggerController(new WinstonLoggerAdapter());

describe('LogsRouter', () => {
  it('can check valid master key of request', done => {
    // Make mock request
    const request = {
      auth: {
        isMaster: true,
      },
      query: {},
      config: {
        loggerController: loggerController,
      },
    };

    const router = new LogsRouter();

    expect(() => {
      router.validateRequest(request);
    }).not.toThrow();
    done();
  });

  it('can check invalid construction of controller', done => {
    // Make mock request
    const request = {
      auth: {
        isMaster: true,
      },
      query: {},
      config: {
        loggerController: undefined, // missing controller
      },
    };

    const router = new LogsRouter();

    expect(() => {
      router.validateRequest(request);
    }).toThrow();
    done();
  });

  it('can check invalid master key of request', done => {
    request({
      url: 'http://localhost:8378/1/scriptlog',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
    }).then(fail, response => {
      const body = response.data;
      expect(response.status).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
      done();
    });
  });

  const headers = {
    'X-Parse-Application-Id': 'test',
    'X-Parse-REST-API-Key': 'rest',
    'X-Parse-Master-Key': 'test',
  };

  /**
   * Verifies simple passwords in GET login requests with special characters are scrubbed from the verbose log
   */
  it('does scrub simple passwords on GET login', done => {
    reconfigureServer({
      verbose: true,
    }).then(function () {
      request({
        headers: headers,
        url: 'http://localhost:8378/1/login?username=test&password=simplepass.com',
      })
        .catch(() => {})
        .then(() => {
          request({
            url: 'http://localhost:8378/1/scriptlog?size=4&level=verbose',
            headers: headers,
          }).then(response => {
            const body = response.data;
            expect(response.status).toEqual(200);
            // 4th entry is our actual GET request
            expect(body[2].url).toEqual('/1/login?username=test&password=********');
            expect(body[2].message).toEqual(
              'REQUEST for [GET] /1/login?username=test&password=********: {}'
            );
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
      verbose: true,
    })
      .then(function () {
        return request({
          headers: headers,
          // using urlencoded password, 'simple @,/?:&=+$#pass.com'
          url:
            'http://localhost:8378/1/login?username=test&password=simple%20%40%2C%2F%3F%3A%26%3D%2B%24%23pass.com',
        })
          .catch(() => {})
          .then(() => {
            return request({
              url: 'http://localhost:8378/1/scriptlog?size=4&level=verbose',
              headers: headers,
            }).then(response => {
              const body = response.data;
              expect(response.status).toEqual(200);
              // 4th entry is our actual GET request
              expect(body[2].url).toEqual('/1/login?username=test&password=********');
              expect(body[2].message).toEqual(
                'REQUEST for [GET] /1/login?username=test&password=********: {}'
              );
              done();
            });
          });
      })
      .catch(done.fail);
  });

  /**
   * Verifies fields in POST login requests are NOT present in the verbose log
   */
  it('does not have password field in POST login', done => {
    reconfigureServer({
      verbose: true,
    }).then(function () {
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/login',
        body: {
          username: 'test',
          password: 'simplepass.com',
        },
      })
        .catch(() => {})
        .then(() => {
          request({
            url: 'http://localhost:8378/1/scriptlog?size=4&level=verbose',
            headers: headers,
          }).then(response => {
            const body = response.data;
            expect(response.status).toEqual(200);
            // 4th entry is our actual GET request
            expect(body[2].url).toEqual('/1/login');
            expect(body[2].message).toEqual(
              'REQUEST for [POST] /1/login: {\n  "username": "test",\n  "password": "********"\n}'
            );
            done();
          });
        });
    });
  });
});
