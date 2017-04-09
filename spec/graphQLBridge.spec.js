/*eslint-disable*/
const GraphQLParseSchema = require('../src/graphql/Schema').GraphQLParseSchema;
const Config = require('../src/Config');
const Auth = require('../src/Auth').Auth;
const { /*print, */printSchema, graphql }  = require('graphql');
const { addFunction } = require('../src/triggers');
//const { /*print, printSchema,*/ GraphQLID, GraphQLNonNull }  = require('graphql');

let config;

describe('graphQLbridge', () => {

  beforeEach(() => {
    config = new Config('test');
  });

  fit('base test', (done) => {
    let schema;
    let nc;
    let obj;
    addFunction('MyFunction', ()=>{}, null, 'test');

    config.database.loadSchema()
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
        obj = new Parse.Object('OtherClass', {foo: 'baz'});
        nc = new Parse.Object('NewClass', {foo: 'hello'});
        return Parse.Object.saveAll([obj, nc]).then(() => {
          nc.set('other', obj);
          obj.set('baz', nc);
          return Parse.Object.saveAll([obj, nc]);
        }).then(() => {
          return schema.getAllClasses(true);
        });
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
      const context = {
        config: config,
        auth: new Auth({config})
      }
      console.log(printSchema(s));
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
      return graphql(s, `
      mutation yMutation($id: ID!) {
        destroyNewClass(objectId: $id)
      }
      `, root, context, {id: nc.id})
      .then((res) => {
        console.log('GOT RES!');
        console.log(JSON.stringify(res, null, 2));
        done();
      });
      //console.log(printSchema(singleSchema));
      //done();
    })
    .catch((err) => {
      console.error(err);
      done.fail();
    })
  });

});
