'use strict';

const Config = require('../lib/Config');
const auth = require('../lib/Auth');
const rest = require('../lib/rest');

describe('request complexity', () => {
  function buildNestedInQuery(depth, className = '_User') {
    let where = {};
    for (let i = 0; i < depth; i++) {
      where = { username: { $inQuery: { className, where } } };
    }
    return where;
  }

  function buildNestedNotInQuery(depth, className = '_User') {
    let where = {};
    for (let i = 0; i < depth; i++) {
      where = { username: { $notInQuery: { className, where } } };
    }
    return where;
  }

  function buildNestedSelect(depth, className = '_User') {
    let where = {};
    for (let i = 0; i < depth; i++) {
      where = { username: { $select: { query: { className, where }, key: 'username' } } };
    }
    return where;
  }

  function buildNestedDontSelect(depth, className = '_User') {
    let where = {};
    for (let i = 0; i < depth; i++) {
      where = { username: { $dontSelect: { query: { className, where }, key: 'username' } } };
    }
    return where;
  }

  function buildNestedOrQuery(depth) {
    let where = { username: 'test' };
    for (let i = 0; i < depth; i++) {
      where = { $or: [where, { username: 'test' }] };
    }
    return where;
  }

  function buildNestedAndQuery(depth) {
    let where = { username: 'test' };
    for (let i = 0; i < depth; i++) {
      where = { $and: [where, { username: 'test' }] };
    }
    return where;
  }

  function buildNestedNorQuery(depth) {
    let where = { username: 'test' };
    for (let i = 0; i < depth; i++) {
      where = { $nor: [where, { username: 'test' }] };
    }
    return where;
  }

  describe('config validation', () => {
    it('should accept valid requestComplexity config', async () => {
      await expectAsync(
        reconfigureServer({
          requestComplexity: {
            includeDepth: 10,
            includeCount: 100,
            subqueryDepth: 5,
            queryDepth: 10,
            graphQLDepth: 15,
            graphQLFields: 300,
          },
        })
      ).toBeResolved();
    });

    it('should accept -1 to disable a specific limit', async () => {
      await expectAsync(
        reconfigureServer({
          requestComplexity: {
            includeDepth: -1,
            includeCount: -1,
            subqueryDepth: -1,
            queryDepth: -1,
            graphQLDepth: -1,
            graphQLFields: -1,
          },
        })
      ).toBeResolved();
    });

    it('should reject value of 0', async () => {
      await expectAsync(
        reconfigureServer({
          requestComplexity: { includeDepth: 0 },
        })
      ).toBeRejectedWith(
        new Error('requestComplexity.includeDepth must be a positive integer or -1 to disable.')
      );
    });

    it('should reject non-integer values', async () => {
      await expectAsync(
        reconfigureServer({
          requestComplexity: { includeDepth: 3.5 },
        })
      ).toBeRejectedWith(
        new Error('requestComplexity.includeDepth must be a positive integer or -1 to disable.')
      );
    });

    it('should reject non-boolean value for allowRegex', async () => {
      await expectAsync(
        reconfigureServer({
          requestComplexity: { allowRegex: 'yes' },
        })
      ).toBeRejectedWith(
        new Error('requestComplexity.allowRegex must be a boolean.')
      );
    });

    it('should reject unknown properties', async () => {
      await expectAsync(
        reconfigureServer({
          requestComplexity: { unknownProp: 5 },
        })
      ).toBeRejectedWith(
        new Error("requestComplexity contains unknown property 'unknownProp'.")
      );
    });

    it('should reject non-object values', async () => {
      await expectAsync(
        reconfigureServer({
          requestComplexity: 'invalid',
        })
      ).toBeRejectedWith(new Error('requestComplexity must be an object.'));
    });

    it('should apply defaults for missing properties', async () => {
      await reconfigureServer({
        requestComplexity: { includeDepth: 3 },
      });
      const config = Config.get('test');
      expect(config.requestComplexity.includeDepth).toBe(3);
      expect(config.requestComplexity.includeCount).toBe(-1);
      expect(config.requestComplexity.subqueryDepth).toBe(-1);
      expect(config.requestComplexity.queryDepth).toBe(-1);
      expect(config.requestComplexity.graphQLDepth).toBe(-1);
      expect(config.requestComplexity.graphQLFields).toBe(-1);
    });

    it('should apply full defaults when not configured', async () => {
      await reconfigureServer({});
      const config = Config.get('test');
      expect(config.requestComplexity).toEqual({
        allowRegex: true,
        batchRequestLimit: -1,
        includeDepth: -1,
        includeCount: -1,
        subqueryDepth: -1,
        queryDepth: -1,
        graphQLDepth: -1,
        graphQLFields: -1,
      });
    });
  });

  describe('subquery depth', () => {
    let config;

    beforeEach(async () => {
      await reconfigureServer({
        requestComplexity: { subqueryDepth: 3 },
      });
      config = Config.get('test');
    });

    it('should allow $inQuery within depth limit', async () => {
      const where = buildNestedInQuery(3);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });

    it('should reject $inQuery exceeding depth limit', async () => {
      const where = buildNestedInQuery(4);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Subquery nesting depth exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should reject $notInQuery exceeding depth limit', async () => {
      const where = buildNestedNotInQuery(4);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Subquery nesting depth exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should reject $select exceeding depth limit', async () => {
      const where = buildNestedSelect(4);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Subquery nesting depth exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should reject $dontSelect exceeding depth limit', async () => {
      const where = buildNestedDontSelect(4);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Subquery nesting depth exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should allow subqueries with master key even when exceeding limit', async () => {
      const where = buildNestedInQuery(4);
      await expectAsync(
        rest.find(config, auth.master(config), '_User', where)
      ).toBeResolved();
    });

    it('should allow subqueries with maintenance key even when exceeding limit', async () => {
      const where = buildNestedInQuery(4);
      await expectAsync(
        rest.find(config, auth.maintenance(config), '_User', where)
      ).toBeResolved();
    });

    it('should allow unlimited subqueries when subqueryDepth is -1', async () => {
      await reconfigureServer({
        requestComplexity: { subqueryDepth: -1 },
      });
      config = Config.get('test');
      const where = buildNestedInQuery(15);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });

    it('should allow multiple sibling $inQuery at same depth within limit', async () => {
      await reconfigureServer({
        requestComplexity: { subqueryDepth: 1 },
      });
      config = Config.get('test');
      // Multiple sibling $inQuery operators in $or, each at depth 1 — within the limit
      const where = {
        $or: [
          { username: { $inQuery: { className: '_User', where: { username: 'a' } } } },
          { username: { $inQuery: { className: '_User', where: { username: 'b' } } } },
          { username: { $inQuery: { className: '_User', where: { username: 'c' } } } },
        ],
      };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });

    it('should reject sibling $inQuery when nested beyond depth limit', async () => {
      await reconfigureServer({
        requestComplexity: { subqueryDepth: 1 },
      });
      config = Config.get('test');
      // Each sibling contains a nested $inQuery at depth 2 — exceeds limit
      const where = {
        $or: [
          {
            username: {
              $inQuery: {
                className: '_User',
                where: { username: { $inQuery: { className: '_User', where: {} } } },
              },
            },
          },
          {
            username: {
              $inQuery: {
                className: '_User',
                where: { username: { $inQuery: { className: '_User', where: {} } } },
              },
            },
          },
        ],
      };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Subquery nesting depth exceeds maximum allowed depth of 1/),
        })
      );
    });

    it('should allow multiple sibling $notInQuery at same depth within limit', async () => {
      await reconfigureServer({
        requestComplexity: { subqueryDepth: 1 },
      });
      config = Config.get('test');
      const where = {
        $or: [
          { username: { $notInQuery: { className: '_User', where: { username: 'a' } } } },
          { username: { $notInQuery: { className: '_User', where: { username: 'b' } } } },
          { username: { $notInQuery: { className: '_User', where: { username: 'c' } } } },
        ],
      };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });

    it('should allow mixed sibling $inQuery and $notInQuery at same depth within limit', async () => {
      await reconfigureServer({
        requestComplexity: { subqueryDepth: 1 },
      });
      config = Config.get('test');
      const where = {
        $or: [
          { username: { $inQuery: { className: '_User', where: { username: 'a' } } } },
          { username: { $notInQuery: { className: '_User', where: { username: 'b' } } } },
          { username: { $inQuery: { className: '_User', where: { username: 'c' } } } },
        ],
      };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });
  });

  describe('query depth', () => {
    let config;

    beforeEach(async () => {
      await reconfigureServer({
        requestComplexity: { queryDepth: 3 },
      });
      config = Config.get('test');
    });

    it('should allow $or within depth limit', async () => {
      const where = buildNestedOrQuery(3);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });

    it('should reject $or exceeding depth limit', async () => {
      const where = buildNestedOrQuery(4);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should reject $and exceeding depth limit', async () => {
      const where = buildNestedAndQuery(4);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should reject $nor exceeding depth limit', async () => {
      const where = buildNestedNorQuery(4);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should reject mixed nested operators exceeding depth limit', async () => {
      // $or > $and > $nor > $or = depth 4
      const where = {
        $or: [
          {
            $and: [
              {
                $nor: [
                  { $or: [{ username: 'a' }, { username: 'b' }] },
                ],
              },
            ],
          },
        ],
      };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should allow with master key even when exceeding limit', async () => {
      const where = buildNestedOrQuery(4);
      await expectAsync(
        rest.find(config, auth.master(config), '_User', where)
      ).toBeResolved();
    });

    it('should allow with maintenance key even when exceeding limit', async () => {
      const where = buildNestedOrQuery(4);
      await expectAsync(
        rest.find(config, auth.maintenance(config), '_User', where)
      ).toBeResolved();
    });

    it('should allow unlimited when queryDepth is -1', async () => {
      await reconfigureServer({
        requestComplexity: { queryDepth: -1 },
      });
      config = Config.get('test');
      const where = buildNestedOrQuery(15);
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });
  });

  describe('include limits', () => {
    let config;

    beforeEach(async () => {
      await reconfigureServer({
        requestComplexity: { includeDepth: 3, includeCount: 5 },
      });
      config = Config.get('test');
    });

    it('should allow include within depth limit', async () => {
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', {}, { include: 'a.b.c' })
      ).toBeResolved();
    });

    it('should reject include exceeding depth limit', async () => {
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', {}, { include: 'a.b.c.d' })
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Include depth of 4 exceeds maximum allowed depth of 3/),
        })
      );
    });

    it('should allow include count within limit', async () => {
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', {}, { include: 'a,b,c,d,e' })
      ).toBeResolved();
    });

    it('should reject include count exceeding limit', async () => {
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', {}, { include: 'a,b,c,d,e,f' })
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Number of include fields \(\d+\) exceeds maximum allowed \(5\)/),
        })
      );
    });

    it('should allow includeAll when within count limit', async () => {
      const schema = new Parse.Schema('IncludeTestClass');
      schema.addPointer('ptr1', '_User');
      schema.addPointer('ptr2', '_User');
      schema.addPointer('ptr3', '_User');
      await schema.save();

      const obj = new Parse.Object('IncludeTestClass');
      await obj.save();

      await expectAsync(
        rest.find(config, auth.nobody(config), 'IncludeTestClass', {}, { includeAll: true })
      ).toBeResolved();
    });

    it('should reject includeAll when exceeding count limit', async () => {
      await reconfigureServer({
        requestComplexity: { includeDepth: 3, includeCount: 2 },
      });
      config = Config.get('test');

      const schema = new Parse.Schema('IncludeTestClass2');
      schema.addPointer('ptr1', '_User');
      schema.addPointer('ptr2', '_User');
      schema.addPointer('ptr3', '_User');
      await schema.save();

      const obj = new Parse.Object('IncludeTestClass2');
      await obj.save();

      await expectAsync(
        rest.find(config, auth.nobody(config), 'IncludeTestClass2', {}, { includeAll: true })
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Number of include fields .* exceeds maximum allowed/),
        })
      );
    });

    it('should allow includes with master key even when exceeding limits', async () => {
      await expectAsync(
        rest.find(config, auth.master(config), '_User', {}, { include: 'a.b.c.d' })
      ).toBeResolved();
    });

    it('should allow unlimited depth when includeDepth is -1', async () => {
      await reconfigureServer({
        requestComplexity: { includeDepth: -1 },
      });
      config = Config.get('test');
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', {}, { include: 'a.b.c.d.e.f.g' })
      ).toBeResolved();
    });

    it('should allow unlimited count when includeCount is -1', async () => {
      await reconfigureServer({
        requestComplexity: { includeCount: -1 },
      });
      config = Config.get('test');
      const includes = Array.from({ length: 100 }, (_, i) => `field${i}`).join(',');
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', {}, { include: includes })
      ).toBeResolved();
    });
  });

  describe('allowRegex', () => {
    let config;

    beforeEach(async () => {
      await reconfigureServer({
        requestComplexity: { allowRegex: false },
      });
      config = Config.get('test');
    });

    it('should reject $regex query when allowRegex is false (unauthenticated)', async () => {
      const where = { username: { $regex: 'test' } };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: '$regex operator is not allowed',
        })
      );
    });

    it('should reject $regex query when allowRegex is false (authenticated user)', async () => {
      const user = new Parse.User();
      user.setUsername('testuser');
      user.setPassword('testpass');
      await user.signUp();
      const userAuth = new auth.Auth({
        config,
        isMaster: false,
        user,
      });
      const where = { username: { $regex: 'test' } };
      await expectAsync(
        rest.find(config, userAuth, '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: '$regex operator is not allowed',
        })
      );
    });

    it('should allow $regex query when allowRegex is false with master key', async () => {
      const where = { username: { $regex: 'test' } };
      await expectAsync(
        rest.find(config, auth.master(config), '_User', where)
      ).toBeResolved();
    });

    it('should allow $regex query when allowRegex is true (default)', async () => {
      await reconfigureServer({
        requestComplexity: { allowRegex: true },
      });
      config = Config.get('test');
      const where = { username: { $regex: 'test' } };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });

    it('should reject $regex inside $or when allowRegex is false', async () => {
      const where = {
        $or: [
          { username: { $regex: 'test' } },
          { username: 'exact' },
        ],
      };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: '$regex operator is not allowed',
        })
      );
    });

    it('should reject $regex inside $and when allowRegex is false', async () => {
      const where = {
        $and: [
          { username: { $regex: 'test' } },
          { username: 'exact' },
        ],
      };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: '$regex operator is not allowed',
        })
      );
    });

    it('should reject $regex inside $nor when allowRegex is false', async () => {
      const where = {
        $nor: [
          { username: { $regex: 'test' } },
        ],
      };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: '$regex operator is not allowed',
        })
      );
    });

    it('should allow $regex by default when allowRegex is not configured', async () => {
      await reconfigureServer({});
      config = Config.get('test');
      const where = { username: { $regex: 'test' } };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeResolved();
    });

    it('should reject empty-string $regex when allowRegex is false', async () => {
      const where = { username: { $regex: '' } };
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: '$regex operator is not allowed',
        })
      );
    });

    it('should allow $regex with maintenance key when allowRegex is false', async () => {
      const where = { username: { $regex: 'test' } };
      await expectAsync(
        rest.find(config, auth.maintenance(config), '_User', where)
      ).toBeResolved();
    });

    describe('LiveQuery', () => {
      beforeEach(async () => {
        await reconfigureServer({
          requestComplexity: { allowRegex: false },
          liveQuery: { classNames: ['TestObject'] },
          startLiveQueryServer: true,
        });
        config = Config.get('test');
      });

      afterEach(async () => {
        const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
        if (client) {
          await client.close();
        }
      });

      it('should reject LiveQuery subscription with $regex when allowRegex is false', async () => {
        const query = new Parse.Query('TestObject');
        query.matches('field', /test/);
        await expectAsync(query.subscribe()).toBeRejectedWith(
          jasmine.objectContaining({ code: Parse.Error.INVALID_QUERY })
        );
      });

      it('should reject LiveQuery subscription with $regex inside $or when allowRegex is false', async () => {
        const query = new Parse.Query('TestObject');
        query._where = {
          $or: [
            { field: { $regex: 'test' } },
            { field: 'exact' },
          ],
        };
        await expectAsync(query.subscribe()).toBeRejectedWith(
          jasmine.objectContaining({ code: Parse.Error.INVALID_QUERY })
        );
      });

      it('should allow LiveQuery subscription without $regex when allowRegex is false', async () => {
        const query = new Parse.Query('TestObject');
        query.equalTo('field', 'test');
        const subscription = await query.subscribe();
        expect(subscription).toBeDefined();
        subscription.unsubscribe();
      });
    });
  });
});
