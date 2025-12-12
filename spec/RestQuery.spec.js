'use strict';
// These tests check the "find" functionality of the REST API.
const auth = require('../lib/Auth');
const Config = require('../lib/Config');
const rest = require('../lib/rest');
const RestQuery = require('../lib/RestQuery');
const request = require('../lib/request');
const querystring = require('querystring');

let config;
let database;
const nobody = auth.nobody(config);

describe('rest query', () => {
  beforeEach(() => {
    config = Config.get('test');
    database = config.database;
  });

  it('basic query', done => {
    rest
      .create(config, nobody, 'TestObject', {})
      .then(() => {
        return rest.find(config, nobody, 'TestObject', {});
      })
      .then(response => {
        expect(response.results.length).toEqual(1);
        done();
      });
  });

  it('query with limit', done => {
    rest
      .create(config, nobody, 'TestObject', { foo: 'baz' })
      .then(() => {
        return rest.create(config, nobody, 'TestObject', { foo: 'qux' });
      })
      .then(() => {
        return rest.find(config, nobody, 'TestObject', {}, { limit: 1 });
      })
      .then(response => {
        expect(response.results.length).toEqual(1);
        expect(response.results[0].foo).toBeTruthy();
        done();
      });
  });

  const data = {
    username: 'blah',
    password: 'pass',
    sessionToken: 'abc123',
  };

  it_exclude_dbs(['postgres'])(
    'query for user w/ legacy credentials without masterKey has them stripped from results',
    done => {
      database
        .create('_User', data)
        .then(() => {
          return rest.find(config, nobody, '_User');
        })
        .then(result => {
          const user = result.results[0];
          expect(user.username).toEqual('blah');
          expect(user.sessionToken).toBeUndefined();
          expect(user.password).toBeUndefined();
          done();
        });
    }
  );

  it_exclude_dbs(['postgres'])(
    'query for user w/ legacy credentials with masterKey has them stripped from results',
    done => {
      database
        .create('_User', data)
        .then(() => {
          return rest.find(config, { isMaster: true }, '_User');
        })
        .then(result => {
          const user = result.results[0];
          expect(user.username).toEqual('blah');
          expect(user.sessionToken).toBeUndefined();
          expect(user.password).toBeUndefined();
          done();
        });
    }
  );

  // Created to test a scenario in AnyPic
  it_exclude_dbs(['postgres'])('query with include', done => {
    let photo = {
      foo: 'bar',
    };
    let user = {
      username: 'aUsername',
      password: 'aPassword',
      ACL: { '*': { read: true } },
    };
    const activity = {
      type: 'comment',
      photo: {
        __type: 'Pointer',
        className: 'TestPhoto',
        objectId: '',
      },
      fromUser: {
        __type: 'Pointer',
        className: '_User',
        objectId: '',
      },
    };
    const queryWhere = {
      photo: {
        __type: 'Pointer',
        className: 'TestPhoto',
        objectId: '',
      },
      type: 'comment',
    };
    const queryOptions = {
      include: 'fromUser',
      order: 'createdAt',
      limit: 30,
    };
    rest
      .create(config, nobody, 'TestPhoto', photo)
      .then(p => {
        photo = p;
        return rest.create(config, nobody, '_User', user);
      })
      .then(u => {
        user = u.response;
        activity.photo.objectId = photo.objectId;
        activity.fromUser.objectId = user.objectId;
        return rest.create(config, nobody, 'TestActivity', activity);
      })
      .then(() => {
        queryWhere.photo.objectId = photo.objectId;
        return rest.find(config, nobody, 'TestActivity', queryWhere, queryOptions);
      })
      .then(response => {
        const results = response.results;
        expect(results.length).toEqual(1);
        expect(typeof results[0].objectId).toEqual('string');
        expect(typeof results[0].photo).toEqual('object');
        expect(typeof results[0].fromUser).toEqual('object');
        expect(typeof results[0].fromUser.username).toEqual('string');
        done();
      })
      .catch(error => {
        console.log(error);
      });
  });

  it('query non-existent class when disabled client class creation', done => {
    const logger = require('../lib/logger').default;
    const loggerErrorSpy = spyOn(logger, 'error').and.callThrough();

    const customConfig = Object.assign({}, config, {
      allowClientClassCreation: false,
    });
    loggerErrorSpy.calls.reset();
    rest.find(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {}).then(
      () => {
        fail('Should throw an error');
        done();
      },
      err => {
        expect(err.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
        expect(err.message).toEqual('Permission denied');
        expect(loggerErrorSpy).toHaveBeenCalledWith('Sanitized error:', jasmine.stringContaining('This user is not allowed to access ' + 'non-existent class: ClientClassCreation'));
        done();
      }
    );
  });

  it('query existent class when disabled client class creation', async () => {
    const customConfig = Object.assign({}, config, {
      allowClientClassCreation: false,
    });
    const schema = await config.database.loadSchema();
    const actualSchema = await schema.addClassIfNotExists('ClientClassCreation', {});
    expect(actualSchema.className).toEqual('ClientClassCreation');

    await schema.reloadData({ clearCache: true });
    // Should not throw
    const result = await rest.find(
      customConfig,
      auth.nobody(customConfig),
      'ClientClassCreation',
      {}
    );
    expect(result.results.length).toEqual(0);
  });

  it('query internal field', async () => {
    const internalFields = [
      '_email_verify_token',
      '_perishable_token',
      '_tombstone',
      '_email_verify_token_expires_at',
      '_failed_login_count',
      '_account_lockout_expires_at',
      '_password_changed_at',
      '_password_history',
    ];
    await Promise.all([
      ...internalFields.map(field =>
        expectAsync(new Parse.Query(Parse.User).exists(field).find()).toBeRejectedWith(
          new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${field}`)
        )
      ),
      ...internalFields.map(field =>
        new Parse.Query(Parse.User).exists(field).find({ useMasterKey: true })
      ),
    ]);
  });

  it('query protected field', async () => {
    const user = new Parse.User();
    user.setUsername('username1');
    user.setPassword('password');
    await user.signUp();
    const config = Config.get(Parse.applicationId);
    const obj = new Parse.Object('Test');

    obj.set('owner', user);
    obj.set('test', 'test');
    obj.set('zip', 1234);
    await obj.save();

    const schema = await config.database.loadSchema();
    await schema.updateClass(
      'Test',
      {},
      {
        get: { '*': true },
        find: { '*': true },
        protectedFields: { [user.id]: ['zip'] },
      }
    );
    await Promise.all([
      new Parse.Query('Test').exists('test').find(),
      expectAsync(new Parse.Query('Test').exists('zip').find()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.OPERATION_FORBIDDEN,
          'Permission denied'
        )
      ),
    ]);
  });

  it('query protected field with matchesQuery', async () => {
    const user = new Parse.User();
    user.setUsername('username1');
    user.setPassword('password');
    await user.signUp();
    const test = new Parse.Object('TestObject', { user });
    await test.save();
    const subQuery = new Parse.Query(Parse.User);
    subQuery.exists('_perishable_token');
    await expectAsync(
      new Parse.Query('TestObject').matchesQuery('user', subQuery).find()
    ).toBeRejectedWith(
      new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Invalid key name: _perishable_token')
    );
  });

  it('query with wrongly encoded parameter', done => {
    rest
      .create(config, nobody, 'TestParameterEncode', { foo: 'bar' })
      .then(() => {
        return rest.create(config, nobody, 'TestParameterEncode', {
          foo: 'baz',
        });
      })
      .then(() => {
        const headers = {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };

        const p0 = request({
          headers: headers,
          url:
            'http://localhost:8378/1/classes/TestParameterEncode?' +
            querystring
              .stringify({
                where: '{"foo":{"$ne": "baz"}}',
                limit: 1,
              })
              .replace('=', '%3D'),
        }).then(fail, response => {
          const error = response.data;
          expect(error.code).toEqual(Parse.Error.INVALID_QUERY);
        });

        const p1 = request({
          headers: headers,
          url:
            'http://localhost:8378/1/classes/TestParameterEncode?' +
            querystring
              .stringify({
                limit: 1,
              })
              .replace('=', '%3D'),
        }).then(fail, response => {
          const error = response.data;
          expect(error.code).toEqual(Parse.Error.INVALID_QUERY);
        });
        return Promise.all([p0, p1]);
      })
      .then(done)
      .catch(err => {
        jfail(err);
        fail('should not fail');
        done();
      });
  });

  it('query with limit = 0', done => {
    rest
      .create(config, nobody, 'TestObject', { foo: 'baz' })
      .then(() => {
        return rest.create(config, nobody, 'TestObject', { foo: 'qux' });
      })
      .then(() => {
        return rest.find(config, nobody, 'TestObject', {}, { limit: 0 });
      })
      .then(response => {
        expect(response.results.length).toEqual(0);
        done();
      });
  });

  it('query with limit = 0 and count = 1', done => {
    rest
      .create(config, nobody, 'TestObject', { foo: 'baz' })
      .then(() => {
        return rest.create(config, nobody, 'TestObject', { foo: 'qux' });
      })
      .then(() => {
        return rest.find(config, nobody, 'TestObject', {}, { limit: 0, count: 1 });
      })
      .then(response => {
        expect(response.results.length).toEqual(0);
        expect(response.count).toEqual(2);
        done();
      });
  });

  it('makes sure null pointers are handed correctly #2189', done => {
    const object = new Parse.Object('AnObject');
    const anotherObject = new Parse.Object('AnotherObject');
    anotherObject
      .save()
      .then(() => {
        object.set('values', [null, null, anotherObject]);
        return object.save();
      })
      .then(() => {
        const query = new Parse.Query('AnObject');
        query.include('values');
        return query.first();
      })
      .then(
        result => {
          const values = result.get('values');
          expect(values.length).toBe(3);
          let anotherObjectFound = false;
          let nullCounts = 0;
          for (const value of values) {
            if (value === null) {
              nullCounts++;
            } else if (value instanceof Parse.Object) {
              anotherObjectFound = true;
            }
          }
          expect(nullCounts).toBe(2);
          expect(anotherObjectFound).toBeTruthy();
          done();
        },
        err => {
          console.error(err);
          fail(err);
          done();
        }
      );
  });

  it('battle test parallel include with 100 nested includes', async () => {
    const RootObject = Parse.Object.extend('RootObject');
    const Level1Object = Parse.Object.extend('Level1Object');
    const Level2Object = Parse.Object.extend('Level2Object');

    // Create 100 level2 objects (10 per level1 object)
    const level2Objects = [];
    for (let i = 0; i < 100; i++) {
      const level2 = new Level2Object({
        index: i,
        value: `level2_${i}`,
      });
      level2Objects.push(level2);
    }
    await Parse.Object.saveAll(level2Objects);

    // Create 10 level1 objects, each with 10 pointers to level2 objects
    const level1Objects = [];
    for (let i = 0; i < 10; i++) {
      const level1 = new Level1Object({
        index: i,
        value: `level1_${i}`,
      });
      // Set 10 pointer fields (level2_0 through level2_9)
      for (let j = 0; j < 10; j++) {
        level1.set(`level2_${j}`, level2Objects[i * 10 + j]);
      }
      level1Objects.push(level1);
    }
    await Parse.Object.saveAll(level1Objects);

    // Create 1 root object with 10 pointers to level1 objects
    const rootObject = new RootObject({
      value: 'root',
    });
    for (let i = 0; i < 10; i++) {
      rootObject.set(`level1_${i}`, level1Objects[i]);
    }
    await rootObject.save();

    // Build include paths: level1_0 through level1_9, and level1_0.level2_0 through level1_9.level2_9
    const includePaths = [];
    for (let i = 0; i < 10; i++) {
      includePaths.push(`level1_${i}`);
      for (let j = 0; j < 10; j++) {
        includePaths.push(`level1_${i}.level2_${j}`);
      }
    }

    // Query with all includes
    const query = new Parse.Query(RootObject);
    query.equalTo('objectId', rootObject.id);
    for (const path of includePaths) {
      query.include(path);
    }
    console.time('query.find');
    const results = await query.find();
    console.timeEnd('query.find');
    expect(results.length).toBe(1);

    const result = results[0];
    expect(result.id).toBe(rootObject.id);

    // Verify all 10 level1 objects are included
    for (let i = 0; i < 10; i++) {
      const level1Field = result.get(`level1_${i}`);
      expect(level1Field).toBeDefined();
      expect(level1Field instanceof Parse.Object).toBe(true);
      expect(level1Field.get('index')).toBe(i);
      expect(level1Field.get('value')).toBe(`level1_${i}`);

      // Verify all 10 level2 objects are included for each level1 object
      for (let j = 0; j < 10; j++) {
        const level2Field = level1Field.get(`level2_${j}`);
        expect(level2Field).toBeDefined();
        expect(level2Field instanceof Parse.Object).toBe(true);
        expect(level2Field.get('index')).toBe(i * 10 + j);
        expect(level2Field.get('value')).toBe(`level2_${i * 10 + j}`);
      }
    }
  });
});

describe('RestQuery.each', () => {
  beforeEach(() => {
    config = Config.get('test');
  });
  it_id('3416c90b-ee2e-4bb5-9231-46cd181cd0a2')(it)('should run each', async () => {
    const objects = [];
    while (objects.length != 10) {
      objects.push(new Parse.Object('Object', { value: objects.length }));
    }
    const config = Config.get('test');
    await Parse.Object.saveAll(objects);
    const query = await RestQuery({
      method: RestQuery.Method.find,
      config,
      auth: auth.master(config),
      className: 'Object',
      restWhere: { value: { $gt: 2 } },
      restOptions: { limit: 2 },
    });
    const spy = spyOn(query, 'execute').and.callThrough();
    const classSpy = spyOn(RestQuery._UnsafeRestQuery.prototype, 'execute').and.callThrough();
    const results = [];
    await query.each(result => {
      expect(result.value).toBeGreaterThan(2);
      results.push(result);
    });
    expect(spy.calls.count()).toBe(0);
    expect(classSpy.calls.count()).toBe(4);
    expect(results.length).toBe(7);
  });

  it_id('0fe22501-4b18-461e-b87d-82ceac4a496e')(it)('should work with query on relations', async () => {
    const objectA = new Parse.Object('Letter', { value: 'A' });
    const objectB = new Parse.Object('Letter', { value: 'B' });

    const object1 = new Parse.Object('Number', { value: '1' });
    const object2 = new Parse.Object('Number', { value: '2' });
    const object3 = new Parse.Object('Number', { value: '3' });
    const object4 = new Parse.Object('Number', { value: '4' });
    await Parse.Object.saveAll([object1, object2, object3, object4]);

    objectA.relation('numbers').add(object1);
    objectB.relation('numbers').add(object2);
    await Parse.Object.saveAll([objectA, objectB]);

    const config = Config.get('test');

    /**
     * Two queries needed since objectId are sorted and we can't know which one
     * going to be the first and then skip by the $gt added by each
     */
    const queryOne = await RestQuery({
      method: RestQuery.Method.get,
      config,
      auth: auth.master(config),
      className: 'Letter',
      restWhere: {
        numbers: {
          __type: 'Pointer',
          className: 'Number',
          objectId: object1.id,
        },
      },
      restOptions: { limit: 1 },
    });

    const queryTwo = await RestQuery({
      method: RestQuery.Method.get,
      config,
      auth: auth.master(config),
      className: 'Letter',
      restWhere: {
        numbers: {
          __type: 'Pointer',
          className: 'Number',
          objectId: object2.id,
        },
      },
      restOptions: { limit: 1 },
    });

    const classSpy = spyOn(RestQuery._UnsafeRestQuery.prototype, 'execute').and.callThrough();
    const resultsOne = [];
    const resultsTwo = [];
    await queryOne.each(result => {
      resultsOne.push(result);
    });
    await queryTwo.each(result => {
      resultsTwo.push(result);
    });
    expect(classSpy.calls.count()).toBe(4);
    expect(resultsOne.length).toBe(1);
    expect(resultsTwo.length).toBe(1);
  });

  it('test afterSave response object is return', done => {
    Parse.Cloud.beforeSave('TestObject2', function (req) {
      req.object.set('tobeaddbefore', true);
      req.object.set('tobeaddbeforeandremoveafter', true);
    });

    Parse.Cloud.afterSave('TestObject2', function (req) {
      const jsonObject = req.object.toJSON();
      delete jsonObject.todelete;
      delete jsonObject.tobeaddbeforeandremoveafter;
      jsonObject.toadd = true;

      return jsonObject;
    });

    rest.create(config, nobody, 'TestObject2', { todelete: true, tokeep: true }).then(response => {
      expect(response.response.toadd).toBeTruthy();
      expect(response.response.tokeep).toBeTruthy();
      expect(response.response.tobeaddbefore).toBeTruthy();
      expect(response.response.tobeaddbeforeandremoveafter).toBeUndefined();
      expect(response.response.todelete).toBeUndefined();
      done();
    });
  });

  it('test afterSave should not affect save response', async () => {
    Parse.Cloud.beforeSave('TestObject2', ({ object }) => {
      object.set('addedBeforeSave', true);
    });
    Parse.Cloud.afterSave('TestObject2', ({ object }) => {
      object.set('addedAfterSave', true);
      object.unset('initialToRemove');
    });
    const { response } = await rest.create(config, nobody, 'TestObject2', {
      initialSave: true,
      initialToRemove: true,
    });
    expect(Object.keys(response).sort()).toEqual([
      'addedAfterSave',
      'addedBeforeSave',
      'createdAt',
      'initialToRemove',
      'objectId',
    ]);
  });
});

describe('REST Query Complexity', () => {
  beforeEach(async () => {
    await reconfigureServer();
  });

  describe('maxIncludeQueryComplexity.count', () => {
    it('should allow queries within fields limit', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          count: 5,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Query with include that's within limit (3 fields: post -> author -> (2 levels))
      const query = new Parse.Query('Comment');
      query.include('post');
      query.include('post.author');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].get('post')).toBeDefined();
    });

    it('should reject queries exceeding fields limit', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          count: 2,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser2');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      const reply = new Parse.Object('Comment');
      reply.set('text', 'Test Reply');
      await reply.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      comment.set('reply', reply);
      await comment.save();

      // Query with include that exceeds limit (3 fields)
      const query = new Parse.Query('Comment');
      query.include('post');
      query.include('post.author');
      query.include('reply');

      await expectAsync(query.find()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
        })
      );
    });

    it('should allow queries with master key even when exceeding fields limit', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          count: 2,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser3');
      user.setPassword('password');
      await user.signUp(null, { useMasterKey: true });

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save(null, { useMasterKey: true });

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save(null, { useMasterKey: true });

      // Query with include that exceeds limit but using master key
      const query = new Parse.Query('Comment');
      query.include('post');
      query.include('post.author');
      const results = await query.find({ useMasterKey: true });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow queries with maintenance key even when exceeding fields limit', async () => {
      await reconfigureServer({
        maintenanceKey: 'maintenanceKey456',
        maxIncludeQueryComplexity: {
          count: 2,
        },
      });

      // Create test objects with relationships using Parse SDK
      const user = new Parse.User();
      user.setUsername('testuser4');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Query with include that exceeds limit but using maintenance key via REST API
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Maintenance-Key': 'maintenanceKey456',
      };
      const response = await request({
        headers,
        url: `http://localhost:8378/1/classes/Comment?include=post,post.author`,
        json: true,
      });

      expect(response.data.results.length).toBeGreaterThan(0);
    });
  });

  describe('maxIncludeQueryComplexity.depth', () => {
    it('should allow queries within depth limit', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 2,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser5');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Query with include depth of 2 (post.author)
      const query = new Parse.Query('Comment');
      query.include('post.author');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });

    it('should reject queries exceeding depth limit', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 1,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser6');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Query with include depth of 2 (exceeds limit of 1)
      const query = new Parse.Query('Comment');
      query.include('post.author');

      await expectAsync(query.find()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
        })
      );
    });

    it('should calculate depth correctly for nested includes', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 3,
        },
      });

      // Create test objects with deep relationships
      const user = new Parse.User();
      user.setUsername('testuser7');
      user.setPassword('password');
      await user.signUp();

      const category = new Parse.Object('Category');
      category.set('name', 'Test Category');
      await category.save();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      post.set('category', category);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Query with include depth of 2 (post.author, post.category) - should be within limit
      const query = new Parse.Query('Comment');
      query.include('post.author');
      query.include('post.category');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow queries with master key even when exceeding depth limit', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 1,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser7b');
      user.setPassword('password');
      await user.signUp(null, { useMasterKey: true });

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save(null, { useMasterKey: true });

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save(null, { useMasterKey: true });

      // Query with include depth of 2 (exceeds limit of 1) but using master key
      const query = new Parse.Query('Comment');
      query.include('post.author');
      const results = await query.find({ useMasterKey: true });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow queries with maintenance key even when exceeding depth limit', async () => {
      await reconfigureServer({
        maintenanceKey: 'maintenanceKey789',
        maxIncludeQueryComplexity: {
          depth: 1,
        },
      });

      // Create test objects with relationships using Parse SDK
      const user = new Parse.User();
      user.setUsername('testuser7c');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Query with include depth of 2 (exceeds limit of 1) but using maintenance key via REST API
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Maintenance-Key': 'maintenanceKey789',
      };
      const response = await request({
        headers,
        url: `http://localhost:8378/1/classes/Comment?include=post.author`,
        json: true,
      });

      expect(response.data.results.length).toBeGreaterThan(0);
    });
  });

  describe('Combined depth and fields validation', () => {
    it('should validate both depth and fields limits', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 2,
          count: 3,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser8');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Query within both limits (1 field, depth 2)
      const query = new Parse.Query('Comment');
      query.include('post.author');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });

    it('should reject if either depth or fields exceeds limit', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 10, // High depth limit
          count: 2,  // Low count limit
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser9');
      user.setPassword('password');
      await user.signUp();

      const category = new Parse.Object('Category');
      category.set('name', 'Test Category');
      await category.save();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      post.set('category', category);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Query with 3 fields (exceeds fields limit) but within depth limit
      const query = new Parse.Query('Comment');
      query.include('post');
      query.include('post.author');
      query.include('post.category');

      await expectAsync(query.find()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
        })
      );
    });
  });

  describe('includeAll blocking with query complexity limits', () => {
    it('should block includeAll when maxIncludeQueryComplexity.depth is configured', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 2,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_includeall_1');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // Query with includeAll should be blocked
      const query = new Parse.Query('Post');
      query.includeAll();

      await expectAsync(query.find()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_QUERY,
          'includeAll is not allowed when query complexity limits are configured'
        )
      );
    });

    it('should block includeAll when maxIncludeQueryComplexity.count is configured', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          count: 3,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_includeall_2');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // Query with includeAll should be blocked
      const query = new Parse.Query('Post');
      query.includeAll();

      await expectAsync(query.find()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_QUERY,
          'includeAll is not allowed when query complexity limits are configured'
        )
      );
    });

    it('should block include("*") when maxIncludeQueryComplexity.depth is configured', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 2,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_includeall_3');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // Query with include("*") should be blocked
      const query = new Parse.Query('Post');
      query.include('*');

      await expectAsync(query.find()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_QUERY,
          'includeAll is not allowed when query complexity limits are configured'
        )
      );
    });

    it('should block include("*") when maxIncludeQueryComplexity.count is configured', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          count: 3,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_includeall_4');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // Query with include("*") should be blocked
      const query = new Parse.Query('Post');
      query.include('*');

      await expectAsync(query.find()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_QUERY,
          'includeAll is not allowed when query complexity limits are configured'
        )
      );
    });

    it('should allow includeAll for master key requests', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 2,
          count: 3,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_includeall_5');
      user.setPassword('password');
      await user.signUp(null, { useMasterKey: true });

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save(null, { useMasterKey: true });

      // Query with includeAll should work with master key
      const query = new Parse.Query('Post');
      query.includeAll();

      const results = await query.find({ useMasterKey: true });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow includeAll when no complexity limits are configured', async () => {
      await reconfigureServer({});

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_includeall_6');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // Query with includeAll should work when no limits are configured
      const query = new Parse.Query('Post');
      query.includeAll();

      const results = await query.find();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Queries without includes', () => {
    it('should allow queries without includes regardless of complexity limits', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 1,
          paths: 1,
        },
      });

      const simpleObject = new Parse.Object('SimpleObject');
      simpleObject.set('name', 'Test');
      simpleObject.set('value', 123);
      await simpleObject.save();

      // Query without includes should not be affected by complexity limits
      const query = new Parse.Query('SimpleObject');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow queries with empty includes array', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 1,
          paths: 1,
        },
      });

      const simpleObject = new Parse.Object('SimpleObject');
      simpleObject.set('name', 'Test');
      simpleObject.set('value', 123);
      await simpleObject.save();

      // Query with empty includes should not be affected
      const query = new Parse.Query('SimpleObject');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('No complexity limits configured', () => {
    it('should allow complex queries when no limits are set', async () => {
      // Use default config without complexity limits
      await reconfigureServer();

      // Create test objects with deep relationships
      const user = new Parse.User();
      user.setUsername('testuser10');
      user.setPassword('password');
      await user.signUp();

      const category = new Parse.Object('Category');
      category.set('name', 'Test Category');
      await category.save();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      post.set('category', category);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Complex query should work without limits
      const query = new Parse.Query('Comment');
      query.include('post');
      query.include('post.author');
      query.include('post.category');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Skipping validation with -1', () => {
    it('should skip depth validation when depth is -1', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: -1,
          count: 2,
        },
      });

      // Create test objects with deep relationships
      const user = new Parse.User();
      user.setUsername('testuser_skip_depth');
      user.setPassword('password');
      await user.signUp();

      const category = new Parse.Object('Category');
      category.set('name', 'Test Category');
      await category.save();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      post.set('category', category);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Deep query should work because depth is -1
      const query = new Parse.Query('Comment');
      query.include('post.author');
      query.include('post.category');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });

    it('should skip count validation when count is -1', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 1,
          count: -1,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_skip_count');
      user.setPassword('password');
      await user.signUp();

      const category = new Parse.Object('Category');
      category.set('name', 'Test Category');
      await category.save();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      post.set('category', category);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Many includes should work because count is -1
      const query = new Parse.Query('Comment');
      query.include('post');
      query.include('post.author');
      query.include('post.category');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });

    it('should skip both validations when both are -1', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: -1,
          count: -1,
        },
      });

      // Create test objects with very deep relationships
      const user = new Parse.User();
      user.setUsername('testuser_skip_both');
      user.setPassword('password');
      await user.signUp();

      const category = new Parse.Object('Category');
      category.set('name', 'Test Category');
      await category.save();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      post.set('category', category);
      await post.save();

      const comment = new Parse.Object('Comment');
      comment.set('text', 'Test Comment');
      comment.set('post', post);
      await comment.save();

      // Very complex query should work
      const query = new Parse.Query('Comment');
      query.include('post');
      query.include('post.author');
      query.include('post.category');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow includeAll when depth is -1', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: -1,
          count: 5,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_includeall_depth_skip');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // includeAll should work because depth is -1
      const query = new Parse.Query('Post');
      query.includeAll();

      const results = await query.find();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow includeAll when count is -1', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 5,
          count: -1,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_includeall_count_skip');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // includeAll should work because count is -1
      const query = new Parse.Query('Post');
      query.includeAll();

      const results = await query.find();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should enforce count limit when depth is -1', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: -1,
          count: 1,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_enforce_count');
      user.setPassword('password');
      await user.signUp();

      const category = new Parse.Object('Category');
      category.set('name', 'Test Category');
      await category.save();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      post.set('category', category);
      await post.save();

      // Query with 2 includes should fail (count limit is 1)
      const query = new Parse.Query('Post');
      query.include('author');
      query.include('category');

      await expectAsync(query.find()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
        })
      );
    });
  });

  describe('Restricting with depth 0 and count 0', () => {
    it('should reject all includes when depth is 0', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 0,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_depth_zero');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // Even simple include should be rejected
      const query = new Parse.Query('Post');
      query.include('author');

      await expectAsync(query.find()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
        })
      );
    });

    it('should reject all includes when count is 0', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          count: 0,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_count_zero');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // Even single include should be rejected
      const query = new Parse.Query('Post');
      query.include('author');

      await expectAsync(query.find()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
        })
      );
    });

    it('should allow queries with depth 0 when no includes are present', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 0,
        },
      });

      // Create simple objects without includes
      const obj = new Parse.Object('SimpleObject');
      obj.set('name', 'Test');
      await obj.save();

      // Query without includes should work
      const query = new Parse.Query('SimpleObject');
      const results = await query.find();

      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow master key even with depth 0', async () => {
      await reconfigureServer({
        maxIncludeQueryComplexity: {
          depth: 0,
        },
      });

      // Create test objects with relationships
      const user = new Parse.User();
      user.setUsername('testuser_depth_zero_master');
      user.setPassword('password');
      await user.signUp(null, { useMasterKey: true });

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save(null, { useMasterKey: true });

      // Master key should bypass depth 0 restriction
      const query = new Parse.Query('Post');
      query.include('author');

      const results = await query.find({ useMasterKey: true });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should allow maintenance key even with count 0', async () => {
      await reconfigureServer({
        maintenanceKey: 'maintenanceKeyZero',
        maxIncludeQueryComplexity: {
          count: 0,
        },
      });

      // Create test objects with relationships using Parse SDK
      const user = new Parse.User();
      user.setUsername('testuser_count_zero_maint');
      user.setPassword('password');
      await user.signUp();

      const post = new Parse.Object('Post');
      post.set('title', 'Test Post');
      post.set('author', user);
      await post.save();

      // Maintenance key should bypass count 0 restriction
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Maintenance-Key': 'maintenanceKeyZero',
        'Content-Type': 'application/json',
      };

      const response = await request({
        headers,
        url: `http://localhost:8378/1/classes/Post?include=author`,
        json: true,
      });

      expect(response.data.results.length).toBeGreaterThan(0);
    });
  });
});

