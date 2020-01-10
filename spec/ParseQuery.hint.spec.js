'use strict';

const Config = require('../lib/Config');
const TestUtils = require('../lib/TestUtils');

let config;

describe_only_db('mongo')('Parse.Query hint', () => {
  beforeEach(() => {
    config = Config.get('test');
  });

  afterEach(async () => {
    await config.database.schemaCache.clear();
    await TestUtils.destroyAllDataPermanently(false);
  });

  it('query find with hint string', async () => {
    const object = new TestObject();
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection(
      'TestObject'
    );
    let explain = await collection._rawFind(
      { _id: object.id },
      { explain: true }
    );
    expect(explain.queryPlanner.winningPlan.stage).toBe('IDHACK');
    explain = await collection._rawFind(
      { _id: object.id },
      { hint: '_id_', explain: true }
    );
    expect(explain.queryPlanner.winningPlan.stage).toBe('FETCH');
    expect(explain.queryPlanner.winningPlan.inputStage.indexName).toBe('_id_');
  });

  it('query find with hint object', async () => {
    const object = new TestObject();
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection(
      'TestObject'
    );
    let explain = await collection._rawFind(
      { _id: object.id },
      { explain: true }
    );
    expect(explain.queryPlanner.winningPlan.stage).toBe('IDHACK');
    explain = await collection._rawFind(
      { _id: object.id },
      { hint: { _id: 1 }, explain: true }
    );
    expect(explain.queryPlanner.winningPlan.stage).toBe('FETCH');
    expect(explain.queryPlanner.winningPlan.inputStage.keyPattern).toEqual({
      _id: 1,
    });
  });

  it('query aggregate with hint string', async () => {
    const object = new TestObject({ foo: 'bar' });
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection(
      'TestObject'
    );
    let result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      explain: true,
    });
    let { queryPlanner } = result[0].stages[0].$cursor;
    expect(queryPlanner.winningPlan.stage).toBe('COLLSCAN');

    result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      hint: '_id_',
      explain: true,
    });
    queryPlanner = result[0].stages[0].$cursor.queryPlanner;
    expect(queryPlanner.winningPlan.stage).toBe('FETCH');
    expect(queryPlanner.winningPlan.inputStage.indexName).toBe('_id_');
  });

  it('query aggregate with hint object', async () => {
    const object = new TestObject({ foo: 'bar' });
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection(
      'TestObject'
    );
    let result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      explain: true,
    });
    let { queryPlanner } = result[0].stages[0].$cursor;
    expect(queryPlanner.winningPlan.stage).toBe('COLLSCAN');

    result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      hint: { _id: 1 },
      explain: true,
    });
    queryPlanner = result[0].stages[0].$cursor.queryPlanner;
    expect(queryPlanner.winningPlan.stage).toBe('FETCH');
    expect(queryPlanner.winningPlan.inputStage.keyPattern).toEqual({ _id: 1 });
  });
});
