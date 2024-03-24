'use strict';

const Config = require('../lib/Config');
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

const profileLevel = 2;
describe_only_db('mongo')('Parse.Query with comment testing', () => {
  beforeAll(async () => {
    config = Config.get('test');
    client = await MongoClient.connect(databaseURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    database = client.db('parseServerMongoAdapterTestDatabase');
    let profiler = await database.command({ profile: 0 });
    expect(profiler.was).toEqual(0);
    console.log(`Disabling profiler : ${profiler.was}`);
    profiler = await database.command({ profile: profileLevel });
    profiler = await database.command({ profile: -1 });
    console.log(`Enabling profiler : ${profiler.was}`);
    profiler = await database.command({ profile: -1 });
    expect(profiler.was).toEqual(profileLevel);
  });

  beforeEach(async () => {
    const profiler = await database.command({ profile: -1 });
    expect(profiler.was).toEqual(profileLevel);
  });

  afterAll(async () => {
    await database.command({ profile: 0 });
    await client.close();
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
