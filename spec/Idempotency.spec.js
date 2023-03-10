'use strict';
const Config = require('../lib/Config');
const Definitions = require('../lib/Options/Definitions');
const request = require('../lib/request');
const rest = require('../lib/rest');
const auth = require('../lib/Auth');
const uuid = require('uuid');

describe('Idempotency', () => {
  // Parameters
  /** Enable TTL expiration simulated by removing entry instead of waiting for MongoDB TTL monitor which
   runs only every 60s, so it can take up to 119s until entry removal - ain't nobody got time for that */
  const SIMULATE_TTL = true;
  const ttl = 2;
  const maxTimeOut = 4000;

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
    await rest.del(config, auth.master(config), '_Idempotency', res.results[0].objectId);
  }
  async function setup(options) {
    await reconfigureServer({
      appId: Parse.applicationId,
      masterKey: Parse.masterKey,
      serverURL: Parse.serverURL,
      idempotencyOptions: options,
    });
  }
  // Setups
  beforeEach(async () => {
    if (SIMULATE_TTL) {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 200000;
    }
    await setup({
      paths: ['functions/.*', 'jobs/.*', 'classes/.*', 'users', 'installations'],
      ttl: ttl,
    });
  });

  // Tests
  it('should enforce idempotency for cloud code function', async () => {
    let counter = 0;
    Parse.Cloud.define('myFunction', () => {
      counter++;
    });
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/functions/myFunction',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123',
      },
    };
    expect(Config.get(Parse.applicationId).idempotencyOptions.ttl).toBe(ttl);
    await request(params);
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual('Duplicate request');
    });
    expect(counter).toBe(1);
  });

  it('should delete request entry after TTL', async () => {
    let counter = 0;
    Parse.Cloud.define('myFunction', () => {
      counter++;
    });
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/functions/myFunction',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123',
      },
    };
    await expectAsync(request(params)).toBeResolved();
    if (SIMULATE_TTL) {
      await deleteRequestEntry('abc-123');
    } else {
      await new Promise(resolve => setTimeout(resolve, maxTimeOut));
    }
    await expectAsync(request(params)).toBeResolved();
    expect(counter).toBe(2);
  });

  it_only_db('postgres')(
    'should delete request entry when postgress ttl function is called',
    async () => {
      const client = Config.get(Parse.applicationId).database.adapter._client;
      let counter = 0;
      Parse.Cloud.define('myFunction', () => {
        counter++;
      });
      const params = {
        method: 'POST',
        url: 'http://localhost:8378/1/functions/myFunction',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
          'X-Parse-Request-Id': 'abc-123',
        },
      };
      await expectAsync(request(params)).toBeResolved();
      await expectAsync(request(params)).toBeRejected();
      await new Promise(resolve => setTimeout(resolve, maxTimeOut));
      await client.one('SELECT idempotency_delete_expired_records()');
      await expectAsync(request(params)).toBeResolved();
      expect(counter).toBe(2);
    }
  );

  it('should enforce idempotency for cloud code jobs', async () => {
    let counter = 0;
    Parse.Cloud.job('myJob', () => {
      counter++;
    });
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/jobs/myJob',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123',
      },
    };
    await expectAsync(request(params)).toBeResolved();
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual('Duplicate request');
    });
    expect(counter).toBe(1);
  });

  it('should enforce idempotency for class object creation', async () => {
    let counter = 0;
    Parse.Cloud.afterSave('MyClass', () => {
      counter++;
    });
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/classes/MyClass',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123',
      },
    };
    await expectAsync(request(params)).toBeResolved();
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual('Duplicate request');
    });
    expect(counter).toBe(1);
  });

  it('should enforce idempotency for user object creation', async () => {
    let counter = 0;
    Parse.Cloud.afterSave('_User', () => {
      counter++;
    });
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/users',
      body: {
        username: 'user',
        password: 'pass',
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123',
      },
    };
    await expectAsync(request(params)).toBeResolved();
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual('Duplicate request');
    });
    expect(counter).toBe(1);
  });

  it('should enforce idempotency for installation object creation', async () => {
    let counter = 0;
    Parse.Cloud.afterSave('_Installation', () => {
      counter++;
    });
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/installations',
      body: {
        installationId: '1',
        deviceType: 'ios',
      },
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123',
      },
    };
    await expectAsync(request(params)).toBeResolved();
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual('Duplicate request');
    });
    expect(counter).toBe(1);
  });

  it('should not interfere with calls of different request ID', async () => {
    let counter = 0;
    Parse.Cloud.afterSave('MyClass', () => {
      counter++;
    });
    const promises = [...Array(100).keys()].map(() => {
      const params = {
        method: 'POST',
        url: 'http://localhost:8378/1/classes/MyClass',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
          'X-Parse-Request-Id': uuid.v4(),
        },
      };
      return request(params);
    });
    await expectAsync(Promise.all(promises)).toBeResolved();
    expect(counter).toBe(100);
  });

  it('should re-throw any other error unchanged when writing request entry fails for any other reason', async () => {
    spyOn(rest, 'create').and.rejectWith(new Parse.Error(0, 'some other error'));
    Parse.Cloud.define('myFunction', () => {});
    const params = {
      method: 'POST',
      url: 'http://localhost:8378/1/functions/myFunction',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'X-Parse-Request-Id': 'abc-123',
      },
    };
    await request(params).then(fail, e => {
      expect(e.status).toEqual(400);
      expect(e.data.error).toEqual('some other error');
    });
  });

  it('should use default configuration when none is set', async () => {
    await setup({});
    expect(Config.get(Parse.applicationId).idempotencyOptions.ttl).toBe(
      Definitions.IdempotencyOptions.ttl.default
    );
    expect(Config.get(Parse.applicationId).idempotencyOptions.paths).toBe(
      Definitions.IdempotencyOptions.paths.default
    );
  });

  it('should throw on invalid configuration', async () => {
    await expectAsync(setup({ paths: 1 })).toBeRejected();
    await expectAsync(setup({ ttl: 'a' })).toBeRejected();
    await expectAsync(setup({ ttl: 0 })).toBeRejected();
    await expectAsync(setup({ ttl: -1 })).toBeRejected();
  });
});
