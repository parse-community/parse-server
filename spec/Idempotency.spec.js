'use strict';
const Config = require('../lib/Config');
const request = require('../lib/request');
const rest = require('../lib/rest');
const auth = require('../lib/Auth');
const uuid = require('uuid');

describe_only_db('mongo')('idempotency for cloud code functions', () => {
  // Parameters
  /** Enable TTL expiration simulated by removing entry instead of waiting for MongoDB TTL monitor which
   runss only every 60s, so it can take up to 119s until entry removal - ain't nobody got time for that */
  const SIMULATE_TTL = true;
  // Helpers
  async function deleteRequestEntry(reqId) {
    const config = Config.get(Parse.applicationId);
    const res = await rest.find(
      config,
      auth.master(config),
      '_Idempotency',
      { reqId: reqId },
      { limit: 1 }
    );
    await rest.del(
      config,
      auth.master(config),
      '_Idempotency',
      res.results[0].objectId);
  }
  // Setups
  beforeEach(async () => {
    if (SIMULATE_TTL) { jasmine.DEFAULT_TIMEOUT_INTERVAL = 200000; }
    await reconfigureServer({
      appId: Parse.applicationId,
      masterKey: Parse.masterKey,
      serverURL: Parse.serverURL,
      idempotencyOptions: {
        ttl: 30,
        functions: ["*"],
        jobs: ["*"],
        classes: ["*"],
      },
    })
  });
  // Tests
  it('should enforce idempotency for cloud code function', async () => {
    // Declare function
    let counter = 0;
    Parse.Cloud.define('myFunction', () => {
      counter++;
    });
    // Run function
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/functions/myFunction',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123'
      }
    };
    expect(Config.get(Parse.applicationId).idempotencyOptions.ttl).toBe(30);
    await request(params);
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual("Duplicate request");
    });
    expect(counter).toBe(1);
  });

  it('should delete request entry after TTL', async () => {
    // Declare function
    let counter = 0;
    Parse.Cloud.define('myFunction', () => {
      counter++;
    });
    // Run function
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/functions/myFunction',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123'
      }
    };
    await expectAsync(request(params)).toBeResolved();
    if (SIMULATE_TTL) {
      await deleteRequestEntry('abc-123');
    } else {
      await new Promise(resolve => setTimeout(resolve, 130000));
    }
    await expectAsync(request(params)).toBeResolved();
    expect(counter).toBe(2);
  });

  it('should enforce idempotency for cloud code jobs', async () => {
    // Declare job
    let counter = 0;
    Parse.Cloud.job('myJob', () => {
      counter++;
    });
    // Run job
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/jobs/myJob',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123'
      }
    };
    await expectAsync(request(params)).toBeResolved();
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual("Duplicate request");
    });
    expect(counter).toBe(1);
  });

  it('should enforce idempotency for class object creation', async () => {
    // Declare trigger
    let counter = 0;
    Parse.Cloud.afterSave('MyClass', () => {
      counter++;
    });
    // Create object
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/classes/MyClass',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123'
      }
    };
    await expectAsync(request(params)).toBeResolved();
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual("Duplicate request");
    });
    expect(counter).toBe(1);
  });

  it('should not interfere with calls of different request ID', async () => {
    // Declare trigger
    let counter = 0;
    Parse.Cloud.afterSave('MyClass', () => {
      counter++;
    });
    // Create 100 objects
    const promises = [...Array(100).keys()].map(() => {
      const params = {
        method: 'POST',
        url: 'http://localhost:8378/1/classes/MyClass',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
          'X-Parse-Request-Id': uuid.v4()
        }
      };
      return request(params);
    });
    await expectAsync(Promise.all(promises)).toBeResolved();
    expect(counter).toBe(100);
  });
});
