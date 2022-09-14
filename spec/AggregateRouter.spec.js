const AggregateRouter = require('../lib/Routers/AggregateRouter').AggregateRouter;

describe('AggregateRouter', () => {
  // TODO: update pipeline syntax. See [#7339](https://bit.ly/3incnWx)
  it('get pipeline from Array', () => {
    const body = [
      {
        group: { objectId: {} },
      },
    ];
    const expected = [{ $group: { _id: {} } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  // TODO: update pipeline syntax. See [#7339](https://bit.ly/3incnWx)
  it('get pipeline from Object', () => {
    const body = {
      group: { objectId: {} },
    };
    const expected = [{ $group: { _id: {} } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  // TODO: update pipeline syntax. See [#7339](https://bit.ly/3incnWx)
  it('get pipeline from Pipeline Operator (Array)', () => {
    const body = {
      pipeline: [
        {
          group: { objectId: {} },
        },
      ],
    };
    const expected = [{ $group: { _id: {} } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  // TODO: update pipeline syntax. See [#7339](https://bit.ly/3incnWx)
  it('get pipeline from Pipeline Operator (Object)', () => {
    const body = {
      pipeline: {
        group: { objectId: {} },
      },
    };
    const expected = [{ $group: { _id: {} } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  // TODO: update pipeline syntax. See [#7339](https://bit.ly/3incnWx)
  it('get pipeline fails multiple keys in Array stage ', () => {
    const body = [
      {
        group: { objectId: {} },
        match: { name: 'Test' },
      },
    ];
    try {
      AggregateRouter.getPipeline(body);
    } catch (e) {
      expect(e.message).toBe('Pipeline stages should only have one key found group, match');
    }
  });

  // TODO: update pipeline syntax. See [#7339](https://bit.ly/3incnWx)
  it('get pipeline fails multiple keys in Pipeline Operator Array stage ', () => {
    const body = {
      pipeline: [
        {
          group: { objectId: {} },
          match: { name: 'Test' },
        },
      ],
    };
    try {
      AggregateRouter.getPipeline(body);
    } catch (e) {
      expect(e.message).toBe('Pipeline stages should only have one key found group, match');
    }
  });

  // TODO: update pipeline syntax. See [#7339](https://bit.ly/3incnWx)
  it('get search pipeline from Pipeline Operator (Array)', () => {
    const body = {
      pipeline: {
        search: {},
      },
    };
    const expected = [{ $search: {} }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  it('support stage name starting with `$`', () => {
    const body = {
      $match: { someKey: 'whatever' },
    };
    const expected = [{ $match: { someKey: 'whatever' } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  it('support nested stage names starting with `$`', () => {
    const body = [
      {
        lookup: {
          from: 'ACollection',
          let: { id: '_id' },
          as: 'results',
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$_id', '$$id'],
                },
              },
            },
          ],
        },
      },
    ];
    const expected = [
      {
        $lookup: {
          from: 'ACollection',
          let: { id: '_id' },
          as: 'results',
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$_id', '$$id'],
                },
              },
            },
          ],
        },
      },
    ];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  it('support the use of `_id` in stages', () => {
    const body = [
      { match: { _id: 'randomId' } },
      { sort: { _id: -1 } },
      { addFields: { _id: 1 } },
      { group: { _id: {} } },
      { project: { _id: 0 } },
    ];
    const expected = [
      { $match: { _id: 'randomId' } },
      { $sort: { _id: -1 } },
      { $addFields: { _id: 1 } },
      { $group: { _id: {} } },
      { $project: { _id: 0 } },
    ];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });
});
