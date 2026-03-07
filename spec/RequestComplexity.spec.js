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

  describe('config validation', () => {
    it('should accept valid requestComplexity config', async () => {
      await expectAsync(
        reconfigureServer({
          requestComplexity: {
            includeDepth: 10,
            includeCount: 100,
            subqueryDepth: 5,
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
      expect(config.requestComplexity.includeCount).toBe(50);
      expect(config.requestComplexity.subqueryDepth).toBe(5);
      expect(config.requestComplexity.graphQLDepth).toBe(50);
      expect(config.requestComplexity.graphQLFields).toBe(200);
    });

    it('should apply full defaults when not configured', async () => {
      await reconfigureServer({});
      const config = Config.get('test');
      expect(config.requestComplexity).toEqual({
        includeDepth: 5,
        includeCount: 50,
        subqueryDepth: 5,
        graphQLDepth: 50,
        graphQLFields: 200,
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
});
