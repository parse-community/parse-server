'use strict';

const Config = require('../lib/Config');
const TestUtils = require('../lib/TestUtils');
const { MongoClient } = require('mongodb');
const databaseURI = 'mongodb://localhost:27017/';
const request = require('../lib/request');

let config, client, database;

const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'X-Parse-Master-Key': 'test',
  'Content-Type': 'application/json',
};

const masterKeyOptions = {
  headers: masterKeyHeaders,
  json: true,
};

describe_only_db('mongo')('Parse.Query with comment testing', () => {
  beforeEach(async () => {
    config = Config.get('test');
    client = await MongoClient.connect(databaseURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    database = client.db('parseServerMongoAdapterTestDatabase');
    const level = 2;
    const profiling = await database.command({ profile: level });
    console.log(`profiling ${JSON.stringify(profiling)}`);
  });

  afterEach(async () => {
    await client.close();
    await TestUtils.destroyAllDataPermanently(false);
  });

  it('send comment with query through REST', async () => {
    const comment = 'Hello Parse';
    const object = new TestObject();
    object.set('name', 'object');
    await object.save();
    const options = Object.assign({}, masterKeyOptions, {
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        explain: true,
        comment: comment,
      },
    });
    await request(options);
    const result = await database.collection('system.profile').findOne({}, { sort: { ts: -1 } });
    expect(result.command.explain.comment).toBe(comment);
  });

  it('send comment with query', async () => {
    const comment = 'Hello Parse';
    const object = new TestObject();
    object.set('name', 'object');
    await object.save();
    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    await collection._rawFind({ name: 'object' }, { comment: comment });
    const result = await database.collection('system.profile').findOne({}, { sort: { ts: -1 } });
    expect(result.command.comment).toBe(comment);
  });

  it('send a comment with a count query', async () => {
    const comment = 'Hello Parse';
    const object = new TestObject();
    object.set('name', 'object');
    await object.save();

    const object2 = new TestObject();
    object2.set('name', 'object');
    await object2.save();

    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    const countResult = await collection.count({ name: 'object' }, { comment: comment });
    expect(countResult).toEqual(2);
    const result = await database.collection('system.profile').findOne({}, { sort: { ts: -1 } });
    expect(result.command.comment).toBe(comment);
  });

  it('attach a comment to an aggregation', async () => {
    const comment = 'Hello Parse';
    const object = new TestObject();
    object.set('name', 'object');
    await object.save();
    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    await collection.aggregate([{ $group: { _id: '$name' } }], {
      explain: true,
      comment: comment,
    });
    const result = await database.collection('system.profile').findOne({}, { sort: { ts: -1 } });
    expect(result.command.explain.comment).toBe(comment);
  });
});
