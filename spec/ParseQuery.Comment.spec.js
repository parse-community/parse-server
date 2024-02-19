'use strict';

const Config = require('../lib/Config');
const TestUtils = require('../lib/TestUtils');
const { MongoClient } = require('mongodb');
const databaseURI = 'mongodb://localhost:27017/';

let config, client, database;

describe_only_db('mongo')('Parse.Query testing', () => {
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
  it('send comment with query', async () => {
    const object = new TestObject();
    object.set('name', 'object');
    const comment = 'comment';
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection('TestObject');

    await collection._rawFind({ name: 'object' }, { comment: comment });

    const result = await database.collection('system.profile').findOne({}, { sort: { ts: -1 } });
    expect(result.command.comment).toBe(comment);
  });
});
