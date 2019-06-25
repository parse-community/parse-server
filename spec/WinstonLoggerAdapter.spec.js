'use strict';

const WinstonLoggerAdapter = require('../lib/Adapters/Logger/WinstonLoggerAdapter')
  .WinstonLoggerAdapter;
const request = require('../lib/request');

describe('info logs', () => {
  it('Verify INFO logs', done => {
    const winstonLoggerAdapter = new WinstonLoggerAdapter();
    winstonLoggerAdapter.log('info', 'testing info logs with 1234');
    winstonLoggerAdapter.query(
      {
        from: new Date(Date.now() - 500),
        size: 100,
        level: 'info',
        order: 'desc',
      },
      results => {
        if (results.length == 0) {
          fail('The adapter should return non-empty results');
        } else {
          const log = results.find(
            x => x.message === 'testing info logs with 1234'
          );
          expect(log.level).toEqual('info');
        }
        // Check the error log
        // Regression #2639
        winstonLoggerAdapter.query(
          {
            from: new Date(Date.now() - 200),
            size: 100,
            level: 'error',
          },
          errors => {
            const log = errors.find(
              x => x.message === 'testing info logs with 1234'
            );
            expect(log).toBeUndefined();
            done();
          }
        );
      }
    );
  });

  it('info logs should interpolate string', async () => {
    const winstonLoggerAdapter = new WinstonLoggerAdapter();
    winstonLoggerAdapter.log('info', 'testing info logs with %s', 'replace');
    const results = await winstonLoggerAdapter.query({
      from: new Date(Date.now() - 500),
      size: 100,
      level: 'info',
      order: 'desc',
    });
    expect(results.length > 0).toBeTruthy();
    const log = results.find(
      x => x.message === 'testing info logs with replace'
    );
    expect(log);
  });
});

describe('error logs', () => {
  it('Verify ERROR logs', done => {
    const winstonLoggerAdapter = new WinstonLoggerAdapter();
    winstonLoggerAdapter.log('error', 'testing error logs');
    winstonLoggerAdapter.query(
      {
        from: new Date(Date.now() - 500),
        size: 100,
        level: 'error',
      },
      results => {
        if (results.length == 0) {
          fail('The adapter should return non-empty results');
          done();
        } else {
          expect(results[0].message).toEqual('testing error logs');
          done();
        }
      }
    );
  });

  it('Should filter on query', done => {
    const winstonLoggerAdapter = new WinstonLoggerAdapter();
    winstonLoggerAdapter.log('error', 'testing error logs');
    winstonLoggerAdapter.query(
      {
        from: new Date(Date.now() - 500),
        size: 100,
        level: 'error',
      },
      results => {
        expect(results.filter(e => e.level !== 'error').length).toBe(0);
        done();
      }
    );
  });

  it('error logs should interpolate string', async () => {
    const winstonLoggerAdapter = new WinstonLoggerAdapter();
    winstonLoggerAdapter.log('error', 'testing error logs with %s', 'replace');
    const results = await winstonLoggerAdapter.query({
      from: new Date(Date.now() - 500),
      size: 100,
      level: 'error',
    });
    expect(results.length > 0).toBeTruthy();
    const log = results.find(
      x => x.message === 'testing error logs with replace'
    );
    expect(log);
  });
});

describe('verbose logs', () => {
  it('mask sensitive information in _User class', done => {
    reconfigureServer({ verbose: true })
      .then(() => createTestUser())
      .then(() => {
        const winstonLoggerAdapter = new WinstonLoggerAdapter();
        return winstonLoggerAdapter.query({
          from: new Date(Date.now() - 500),
          size: 100,
          level: 'verbose',
        });
      })
      .then(results => {
        const logString = JSON.stringify(results);
        expect(logString.match(/\*\*\*\*\*\*\*\*/g).length).not.toBe(0);
        expect(logString.match(/moon-y/g)).toBe(null);

        const headers = {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };
        request({
          headers: headers,
          url: 'http://localhost:8378/1/login?username=test&password=moon-y',
        }).then(() => {
          const winstonLoggerAdapter = new WinstonLoggerAdapter();
          return winstonLoggerAdapter
            .query({
              from: new Date(Date.now() - 500),
              size: 100,
              level: 'verbose',
            })
            .then(results => {
              const logString = JSON.stringify(results);
              expect(logString.match(/\*\*\*\*\*\*\*\*/g).length).not.toBe(0);
              expect(logString.match(/moon-y/g)).toBe(null);
              done();
            });
        });
      })
      .catch(err => {
        fail(JSON.stringify(err));
        done();
      });
  });

  it('verbose logs should interpolate string', async () => {
    await reconfigureServer({ verbose: true });
    const winstonLoggerAdapter = new WinstonLoggerAdapter();
    winstonLoggerAdapter.log(
      'verbose',
      'testing verbose logs with %s',
      'replace'
    );
    const results = await winstonLoggerAdapter.query({
      from: new Date(Date.now() - 500),
      size: 100,
      level: 'verbose',
    });
    expect(results.length > 0).toBeTruthy();
    const log = results.find(
      x => x.message === 'testing verbose logs with replace'
    );
    expect(log);
  });
});
