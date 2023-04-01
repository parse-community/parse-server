const AggregateRouter = require('../lib/Routers/AggregateRouter').AggregateRouter;

describe('AggregateRouter', () => {
  it('get pipeline from Array', () => {
    const body = [
      {
        $group: { _id: {} },
      },
    ];
    const expected = [{ $group: { _id: {} } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  it('get pipeline from Object', () => {
    const body = {
      $group: { _id: {} },
    };
    const expected = [{ $group: { _id: {} } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  it('get pipeline from Pipeline Operator (Array)', () => {
    const body = {
      pipeline: [
        {
          $group: { _id: {} },
        },
      ],
    };
    const expected = [{ $group: { _id: {} } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  it('get pipeline from Pipeline Operator (Object)', () => {
    const body = {
      pipeline: {
        $group: { _id: {} },
      },
    };
    const expected = [{ $group: { _id: {} } }];
    const result = AggregateRouter.getPipeline(body);
    expect(result).toEqual(expected);
  });

  it('get pipeline fails multiple keys in Array stage ', () => {
    const body = [
      {
        $group: { _id: {} },
        $match: { name: 'Test' },
      },
    ];
    expect(() => AggregateRouter.getPipeline(body)).toThrow(
      new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Pipeline stages should only have one key but found $group, $match.'
      )
    );
  });

  it('get pipeline fails multiple keys in Pipeline Operator Array stage ', () => {
    const body = {
      pipeline: [
        {
          $group: { _id: {} },
          $match: { name: 'Test' },
        },
      ],
    };
    expect(() => AggregateRouter.getPipeline(body)).toThrow(
      new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Pipeline stages should only have one key but found $group, $match.'
      )
    );
  });

  it('get search pipeline from Pipeline Operator (Array)', () => {
    const body = {
      pipeline: {
        $search: {},
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
      { $match: { _id: 'randomId' } },
      { $sort: { _id: -1 } },
      { $addFields: { _id: 1 } },
      { $group: { _id: {} } },
      { $project: { _id: 0 } },
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

  it('should throw with invalid stage', () => {
    expect(() => AggregateRouter.getPipeline([{ foo: 'bar' }])).toThrow(
      new Parse.Error(Parse.Error.INVALID_QUERY, `Invalid aggregate stage 'foo'.`)
    );
  });

  it('should throw with invalid group', () => {
    expect(() => AggregateRouter.getPipeline([{ $group: { objectId: 'bar' } }])).toThrow(
      new Parse.Error(
        Parse.Error.INVALID_QUERY,
        `Cannot use 'objectId' in aggregation stage $group.`
      )
    );
  });
});
