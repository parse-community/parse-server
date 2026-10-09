'use strict';

const request = require('../lib/request');

const headers = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-REST-API-Key': 'rest',
  'Content-Type': 'application/json',
};

const masterKeyHeaders = {
  ...headers,
  'X-Parse-Master-Key': 'test',
};

function findOneAndUpdate(className, body, requestHeaders = headers) {
  return request({
    method: 'PUT',
    url: `${Parse.serverURL}/classes/${className}`,
    headers: requestHeaders,
    body,
  }).then(response => response.data);
}

function expectError(promise, code) {
  return promise.then(
    () => fail('should have failed'),
    error => expect(error.data.code).toBe(code)
  );
}

describe('find and update', () => {
  it('updates the first matching object and returns it', async () => {
    const task = new Parse.Object('Task');
    await task.save({ status: 'open', count: 1 });
    await new Parse.Object('Task').save({ status: 'done', count: 1 });

    const { results } = await findOneAndUpdate('Task', {
      where: { status: 'open' },
      update: { status: 'claimed', count: { __op: 'Increment', amount: 2 } },
    });

    expect(results.length).toBe(1);
    expect(results[0].objectId).toBe(task.id);
    expect(results[0].status).toBe('claimed');
    expect(results[0].count).toBe(3);
    await task.fetch();
    expect(task.get('status')).toBe('claimed');
    expect(task.get('count')).toBe(3);
    expect(task.updatedAt.toISOString()).toBe(results[0].updatedAt);
  });

  it('returns no object if no object matches', async () => {
    await new Parse.Object('Task').save({ status: 'done' });
    const { results } = await findOneAndUpdate('Task', {
      where: { status: 'open' },
      update: { status: 'claimed' },
    });
    expect(results).toEqual([]);
  });

  it('updates each object only once on concurrent requests', async () => {
    const tasks = [1, 2, 3].map(() => new Parse.Object('Task', { status: 'open' }));
    await Parse.Object.saveAll(tasks);

    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        findOneAndUpdate('Task', { where: { status: 'open' }, update: { status: 'claimed' } })
      )
    );

    const claimedIds = responses.flatMap(({ results }) => results.map(r => r.objectId));
    expect(claimedIds.sort()).toEqual(tasks.map(t => t.id).sort());
  });

  it('updates the first object in the given order', async () => {
    const tasks = [3, 1, 2].map(priority => new Parse.Object('Task', { status: 'open', priority }));
    await Parse.Object.saveAll(tasks);

    const ascending = await findOneAndUpdate('Task', {
      where: { status: 'open' },
      order: 'priority',
      update: { status: 'claimed' },
    });
    expect(ascending.results[0].priority).toBe(1);

    const descending = await findOneAndUpdate('Task', {
      where: { status: 'open' },
      order: '-priority',
      update: { status: 'claimed' },
    });
    expect(descending.results[0].priority).toBe(3);
  });

  it('returns only the requested keys', async () => {
    await new Parse.Object('Task').save({ status: 'open', title: 'a' });
    const { results } = await findOneAndUpdate('Task', {
      where: { status: 'open' },
      keys: 'status',
      update: { status: 'claimed' },
    });
    expect(results[0].status).toBe('claimed');
    expect(results[0].title).toBeUndefined();
  });

  it('supports relation operations', async () => {
    const tag = new Parse.Object('Tag');
    const task = new Parse.Object('Task');
    await Parse.Object.saveAll([tag, task.set('status', 'open')]);

    await findOneAndUpdate('Task', {
      where: { status: 'open' },
      update: { tags: { __op: 'AddRelation', objects: [tag.toPointer()] } },
    });

    const tags = await task.relation('tags').query().find();
    expect(tags.map(t => t.id)).toEqual([tag.id]);
  });

  it('rejects if the class has a beforeSave trigger', async () => {
    Parse.Cloud.beforeSave('Task', () => {});
    const task = new Parse.Object('Task');
    await task.save({ status: 'open' }, { useMasterKey: true });

    await expectError(
      findOneAndUpdate('Task', { where: { status: 'open' }, update: { status: 'claimed' } }),
      Parse.Error.OPERATION_FORBIDDEN
    );
    await task.fetch();
    expect(task.get('status')).toBe('open');
  });

  it('runs the afterSave trigger with the original and updated object', async () => {
    const afterSave = jasmine.createSpy('afterSave');
    Parse.Cloud.afterSave('Task', ({ object, original }) => {
      afterSave(object.id, original.get('count'), object.get('count'));
    });
    const task = new Parse.Object('Task');
    await task.save({ status: 'open', count: 1 });

    await findOneAndUpdate('Task', {
      where: { status: 'open' },
      update: { status: 'claimed', count: { __op: 'Increment', amount: 1 } },
    });

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(afterSave).toHaveBeenCalledWith(task.id, 1, 2);
  });

  it('only updates objects the user can read and write', async () => {
    const user = await Parse.User.signUp('user', 'password');

    const readOnly = new Parse.Object('Task', { status: 'open' });
    readOnly.setACL(new Parse.ACL({ '*': { read: true } }));
    const writeOnly = new Parse.Object('Task', { status: 'open' });
    writeOnly.setACL(new Parse.ACL({ [user.id]: { write: true } }));
    const readWrite = new Parse.Object('Task', { status: 'open' });
    readWrite.setACL(new Parse.ACL(user));
    await Parse.Object.saveAll([readOnly, writeOnly, readWrite]);

    const userHeaders = { ...headers, 'X-Parse-Session-Token': user.getSessionToken() };
    const first = await findOneAndUpdate(
      'Task',
      { where: { status: 'open' }, update: { status: 'claimed' } },
      userHeaders
    );
    expect(first.results.map(r => r.objectId)).toEqual([readWrite.id]);

    const second = await findOneAndUpdate(
      'Task',
      { where: { status: 'open' }, update: { status: 'claimed' } },
      userHeaders
    );
    expect(second.results).toEqual([]);
  });

  it('requires the update and find class-level permissions', async () => {
    await new Parse.Object('Task').save({ status: 'open' });
    const schema = new Parse.Schema('Task');
    await schema.setCLP({
      find: { '*': true },
      get: { '*': true },
      create: { '*': true },
      update: {},
    });
    await schema.update();
    await expectError(
      findOneAndUpdate('Task', { where: { status: 'open' }, update: { status: 'claimed' } }),
      Parse.Error.OPERATION_FORBIDDEN
    );

    await schema.setCLP({
      find: {},
      get: { '*': true },
      create: { '*': true },
      update: { '*': true },
    });
    await schema.update();
    await expectError(
      findOneAndUpdate('Task', { where: { status: 'open' }, update: { status: 'claimed' } }),
      Parse.Error.OPERATION_FORBIDDEN
    );
  });

  it('rejects a query on protected fields', async () => {
    await reconfigureServer({
      protectedFields: { Task: { '*': ['secret'] } },
    });
    await new Parse.Object('Task').save({ status: 'open', secret: 'a' });

    await expectError(
      findOneAndUpdate('Task', { where: { secret: 'a' }, update: { status: 'claimed' } }),
      Parse.Error.OPERATION_FORBIDDEN
    );
    const { results } = await findOneAndUpdate('Task', {
      where: { status: 'open' },
      update: { status: 'claimed' },
    });
    expect(results[0].status).toBe('claimed');
    expect(results[0].secret).toBeUndefined();
  });

  it('rejects system classes', async () => {
    await expectError(
      findOneAndUpdate('_User', { where: {}, update: { name: 'a' } }, masterKeyHeaders),
      Parse.Error.OPERATION_FORBIDDEN
    );
  });

  it('rejects invalid parameters', async () => {
    await expectError(
      findOneAndUpdate('Task', { where: {}, update: {}, limit: 2 }),
      Parse.Error.INVALID_QUERY
    );
    await expectError(findOneAndUpdate('Task', { where: {} }), Parse.Error.INVALID_JSON);
    await expectError(
      findOneAndUpdate('Task', { where: 'invalid', update: {} }),
      Parse.Error.INVALID_JSON
    );
  });
});
