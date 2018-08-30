const GraphQLParseSchema = require('../lib/graphql/Schema').GraphQLParseSchema;
const Config = require('../lib/Config');
const Auth = require('../lib/Auth').Auth;
const { graphql, GraphQLInt, GraphQLInputObjectType, GraphQLObjectType, GraphQLList }  = require('graphql');
let config;

async function setup(config) {
  const schema = await config.database.loadSchema();
  await schema.addClassIfNotExists('NewClass', {
    stringValue: { type: 'String' },
    booleanValue: { type: 'Boolean' },
    numberValue: { type: 'Number' },
    arrayValue: { type: 'Array' },
    file: { type: 'File' },
    geoPointValue: { type: 'GeoPoint' },
    dateValue: { type: 'Date' },
    others: { type: 'Relation', targetClass: 'OtherClass' }
  });
  await schema.addClassIfNotExists('OtherClass', {
    otherString: { type: 'String' },
    newClass: { type: 'Pointer', targetClass: 'NewClass' }
  });
}

describe('graphQLbridge', () => {
  let schema;
  let root;
  async function reload() {
    const Schema = new GraphQLParseSchema('test');
    const result = await Schema.load();
    schema = result.schema;
    root = result.root;
  }
  beforeEach(async () => {
    config = Config.get('test');
    await setup(config);
  });

  it('runs basic functions', async () => {
    Parse.Cloud.define('health', () => {
      return 'OK';
    });
    await reload();
    const context = {
      config,
      auth: new Auth({config})
    }
    const result = await graphql(schema, `
      mutation callFunction {
        health
      }
      `, root, context);
    expect(result.errors).toBeUndefined();
    expect(result.data.health).toBe(true);
  });

  it('runs functions with params', async () => {
    Parse.Cloud.define('squareUp', {
      description: 'Call this function to square up!',
      type: new GraphQLObjectType({
        name: 'CustomType',
        fields: {
          result: { type: GraphQLInt },
        }
      }),
      inputType: new GraphQLInputObjectType({
        name: 'CustomInputType',
        fields: {
          request: { type: GraphQLInt }
        }
      }),
      handler: (req) => {
        const { params } = req;
        return  {
          result: params.request * params.request
        }
      }
    });
    await reload();

    const context = {
      config,
      auth: new Auth({config})
    }
    const result = await graphql(schema, `
      mutation callFunction {
        squareUp(input: { request: 15 }) {
          result
        }
      }
      `, root, context);
    expect(result.errors).toBeUndefined();
    expect(result.data.squareUp.result).toBe(225);
  });

  it('runs functions that provide parse types', async () => {
    Parse.Cloud.define('getAllNewClasses', {
      description: 'Call this function to square up!',
      type: new GraphQLObjectType({
        name: 'CustomType',
        fields: () => ({
          nodes: { type: new GraphQLList(Parse.Cloud.GraphQLUtils.getObjectType('NewClass'))  },
        })
      }),
      inputType: new GraphQLInputObjectType({
        name: 'CustomInputType',
        fields: {
          min: { type: GraphQLInt }
        }
      }),
      handler: async (req) => {
        const query = new Parse.Query('NewClass');
        query.greaterThan('numberValue', req.params.min);
        return  {
          nodes: await query.find()
        }
      }
    });
    await reload();

    const context = {
      config,
      auth: new Auth({config})
    }
    const objects = [];
    while (objects.length < 10) {
      const obj = new Parse.Object('NewClass');
      obj.set('numberValue', objects.length);
      objects.push(obj);
    }

    await Parse.Object.saveAll(objects);
    const result = await graphql(schema, `
      mutation callFunction {
        getAllNewClasses(input: { min: 3 }) {
          nodes {
            id
            objectId
            numberValue
          }
        }
      }
      `, root, context);
    expect(result.errors).toBeUndefined();
    expect(result.data.getAllNewClasses.nodes.length).toBe(6);
    result.data.getAllNewClasses.nodes.forEach((node) => {
      expect(node.numberValue).toBeGreaterThan(3);
    });
  });
});
