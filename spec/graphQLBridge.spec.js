/*eslint-disable*/
const GraphQLParseSchema = require('../src/graphql/Schema').GraphQLParseSchema;
const Config = require('../src/Config');
const Auth = require('../src/Auth').Auth;
const { /*print, */printSchema, graphql }  = require('graphql');
const { addFunction } = require('../src/triggers');
//const { /*print, printSchema,*/ GraphQLID, GraphQLNonNull }  = require('graphql');

let config;

function setup(config) {
  let schema;
  return config.database.loadSchema()
  .then(dbSchema => {
    schema = dbSchema;
    return dbSchema.addClassIfNotExists('NewClass', {
      foo: { type: 'String' },
      bar: { type: 'Boolean' },
      increment: { type: 'Number' },
      other: { type: 'Pointer', targetClass: 'OtherClass' }
    }).then(() => {
      return dbSchema.addClassIfNotExists('OtherClass', {
        foo: { type: 'String' },
        baz: { type: 'Pointer', targetClass: 'NewClass' }
      })
    }).then(() => {
        return schema.getAllClasses(true);
    });
  })
  .then((allClasses) => {
    const fullSchema = allClasses.reduce((memo, classDef) => {
      memo[classDef.className] = classDef;
      return memo;
    }, {});

    const Schema = new GraphQLParseSchema(fullSchema, 'test');
    const s = Schema.Schema();
    const root = Schema.Root();
    return {
      schema: s,
      root,
    }
  });
}

describe('graphQLbridge', () => {
  let schema;
  let root;
  beforeEach((done) => {
    config = Config.get('test');
    setup(config).then((result) => {
      schema = result.schema;
      root = result.root;
    }).then(done);
  });

  fit('base test', (done) => {
    console.log(printSchema(schema));
    done();
      /*
      `
      mutation {
        NewClass {
          create(foo: "hello", bar: false, increment: 1) {
            objectId, foo, bar, increment
          }
        }
      }`
      ...on NewClass { objectId, foo, bar, increment }
       */

      /*return graphql(s,`
      mutation {
        create(className: "NewClass", params: {foo: "Bar", bar: true, increment: 10}) {
          objectId,
          createdAt,
          updatedAt,
          ... on Object { data }
        }
      }`, root, context).then((res) => {
        console.log(res);
        const objectId = res.data.create.objectId;
        return graphql(s,  `
          mutation myMutation($id: ID!) {
            NewClass {
              update(objectId: $id, incrementKey: { key: "increment", value: 2 }) {
                objectId, increment
              }
            }
          }`, root, context, {id: objectId});
      })*/
      /*
      query {
        OtherClass {
          objectId,
          baz {
            foo,
            bar
          }
        },
        OtherClass {
          foo, objectId
        }
      }
      mutation {
        NewClass: createNewClass(input: {
          foo: "hello", 
          bar: false, 
          increment: 1 
        }) {
            objectId, foo, bar, increment
        }

        NewClass: createNewClass(input: {
          foo: "hello", 
          bar: false, 
          increment: 1 
        }) {
            objectId, foo, bar, increment
        }
      }
       */
 
      /*return graphql(s, `
      query {
        NewClass(where: {}) {
          objectId
        }
        OtherClass(where: {}) {
          objectId,
          foo,
          baz {
            objectId,
            increment,
            other {
              foo,
              objectId,
              baz {
                objectId
              }
            }
          }
        }
      }
      `,root, context)*/
  });

  fit('test query', (done) => {
    const context = {
      config,
      auth: new Auth({config})
    }
    let obj = new Parse.Object('OtherClass', {foo: 'baz'});
    let nc = new Parse.Object('NewClass', {foo: 'hello'});
    return Parse.Object.saveAll([obj, nc]).then(() => {
      nc.set('other', obj);
      obj.set('baz', nc);
      return Parse.Object.saveAll([obj, nc]);
    }).then(() => {
      return graphql(schema, `
      query {
        NewClass {
          objectId
        }
        OtherClass {
          objectId,
          foo,
          baz {
            objectId,
            increment,
            foo,
            other {
              foo,
              objectId,
              baz {
                objectId
              }
            }
          }
        }
      }
      `,root, context)
    }).then((res) => {
      expect(res.data.NewClass).toBeDefined();
      expect(res.data.OtherClass).toBeDefined();
      expect(Array.isArray(res.data.NewClass)).toBeTruthy();
      expect(Array.isArray(res.data.OtherClass)).toBeTruthy();
      const newClasses = res.data.NewClass;
      // Should only have objectId
      newClasses.forEach((object) => {
        expect(Object.keys(object).length).toBe(1);
        expect(object.objectId).toBeDefined();
      });

      const otherClasses = res.data.OtherClass;
      const otherObject = otherClasses[0];
      expect(otherObject.objectId).toEqual(otherObject.baz.other.objectId);
      expect(otherObject.baz.objectId).toEqual(otherObject.baz.other.baz.objectId);
    }).then(done).catch(done.fail);
  })

  it('test destroy', (done) => {
    const context = {
      config,
      auth: new Auth({config})
    }
    let obj = new Parse.Object('OtherClass', {foo: 'baz'});
    let nc = new Parse.Object('NewClass', {foo: 'hello'});
    return Parse.Object.saveAll([obj, nc]).then(() => {
      nc.set('other', obj);
      obj.set('baz', nc);
      return Parse.Object.saveAll([obj, nc]);
    }).then(() => {
      return graphql(schema, `
      mutation myMutation($id: ID!) {
        destroyNewClass(objectId: $id) {
          objectId,
          bar
        }
      }
      `, root, context, {id: nc.id})
    }).then((res) => {
        console.log('GOT RES!');
        console.log(JSON.stringify(res, null, 2));
        done();
      }).catch((err) => {
      console.error(err);
      done.fail();
    });
  });
});
