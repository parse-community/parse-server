/*eslint-disable*/
const GraphQLParseSchema = require('../src/graphql/Schema').GraphQLParseSchema;
const Config = require('../src/Config');
const Auth = require('../src/Auth').Auth;
const { /*print, */printSchema, graphql }  = require('graphql');
//const { /*print, printSchema,*/ GraphQLID, GraphQLNonNull }  = require('graphql');

let config;

describe('graphQLbridge', () => {

  beforeEach(() => {
    config = new Config('test');
  });

  fit('base test', (done) => {
    let schema;
    config.database.loadSchema()
    .then(dbSchema => {
      schema = dbSchema;
      return dbSchema.addClassIfNotExists('NewClass', {
        foo: { type: 'String' },
        bar: { type: 'Boolean' },
        increment: { type: 'Number' }
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

      const Schema = new GraphQLParseSchema(fullSchema);
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
 
      return graphql(s, `
      query {
        NewClass(where: {foo: { regex: "hello" }}) {
          objectId
        }
      }
      `,root, context)
      .then((res) => {
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
