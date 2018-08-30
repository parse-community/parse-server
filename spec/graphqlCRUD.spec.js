const GraphQLParseSchema = require('../lib/graphql/Schema').GraphQLParseSchema;
const Config = require('../lib/Config');
const Auth = require('../lib/Auth').Auth;
const { graphql }  = require('graphql');
const { containsOnlyIdFields, transformQueryConstraint, transformResult, parseID } = require('../lib/graphql/execute');

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
  const Schema = new GraphQLParseSchema('test');
  return await Schema.load();
}

describe('graphQL CRUD operations', () => {
  let schema;
  let root;
  let context;
  beforeEach(async () => {
    config = Config.get('test');
    const result = await setup(config);
    schema = result.schema;
    root = result.root;
    context = {
      config,
      auth: new Auth({config})
    }
  });

  it('Adds objects', async () => {
    const ACL = new Parse.ACL();
    ACL.setPublicReadAccess(true);
    ACL.setPublicWriteAccess(true);
    const dateValue = new Date('2018-09-01');
    const input = {
      newClass: {
        stringValue: 'Hello World!',
        booleanValue: true,
        numberValue: -1,
        dateValue,
        ACL,
        geoPointValue: { latitude: 20.0, longitude: 10.0 },
      }
    };
    const createResult = await graphql(schema, `
      mutation myMutation($newClass: AddNewClassInput!) {
        addNewClass(input: $newClass) {
          object {
            createdAt
            updatedAt
            objectId,
            stringValue
            numberValue,
            booleanValue
            dateValue,
            ACL,
            geoPointValue {
              latitude
              longitude
            }
          }
        }
      }
      `, root, context, input);
    expect(createResult.errors).not.toBeDefined();
    expect(createResult.data).not.toBeNull();
    const { object } = createResult.data.addNewClass;
    expect(object).toBeDefined();
    expect(object.objectId).toBeDefined();
    expect(object.createdAt).toBeDefined();
    expect(object.createdAt instanceof Date).toBeTruthy();
    expect(object.updatedAt).toBeDefined();
    expect(object.updatedAt instanceof Date).toBeTruthy();
    expect(object).toEqual({
      objectId: object.objectId,
      stringValue: 'Hello World!',
      booleanValue: true,
      numberValue: -1,
      dateValue: dateValue,
      ACL: { '*': { read: true, write: true }},
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
      geoPointValue: {
        latitude: 20.0,
        longitude: 10.0
      }
    });
  });

  it('Queries objects', async () => {
    const publicACL = new Parse.ACL();
    publicACL.setPublicReadAccess(true);
    publicACL.setPublicWriteAccess(true);
    const obj = new Parse.Object('OtherClass', {otherString: 'baz'});
    const nc = new Parse.Object('NewClass', {stringValue: 'hello'});
    nc.setACL(publicACL);
    await Parse.Object.saveAll([obj, nc]);
    nc.relation('others').add(obj);
    obj.set('newClass', nc);
    await Parse.Object.saveAll([obj, nc]);
    const res = await graphql(schema, `
      query {
        NewClass: findNewClass {
          nodes {
            objectId
            ACL
          }
        }
        OtherClass: findOtherClass {
          nodes {
            objectId,
            otherString,
            newClass {
              objectId,
              stringValue,
              booleanValue
              numberValue,
              others {
                nodes {
                  otherString,
                  objectId,
                  newClass {
                    objectId
                    id
                  }
                }
              }
            }
          }
        }
      }
      `,root, context);

    expect(res.data.NewClass).toBeDefined();
    expect(res.data.OtherClass).toBeDefined();
    expect(Array.isArray(res.data.NewClass.nodes)).toBeTruthy();
    expect(Array.isArray(res.data.OtherClass.nodes)).toBeTruthy();
    const newClasses = res.data.NewClass.nodes;
    // Should only have objectId
    newClasses.forEach((object) => {
      expect(Object.keys(object).length).toBe(2);
      expect(object.objectId).toBeDefined();
      expect(object.ACL).toEqual({
        '*': { 'read': true, 'write': true }
      })
    });

    const otherClasses = res.data.OtherClass.nodes;
    const otherObject = otherClasses[0];
    expect(otherObject.objectId).not.toBeUndefined();
    expect(otherObject.newClass.objectId).not.toBeUndefined();
    expect(otherObject.objectId).toEqual(otherObject.newClass.others.nodes[0].objectId);
    expect(otherObject.newClass.objectId).toEqual(otherObject.newClass.others.nodes[0].newClass.objectId);
  });

  it('finds object with queries', async () => {
    const obj = new Parse.Object('NewClass', {stringValue: 'baz'});
    const obj2 = new Parse.Object('NewClass', {stringValue: 'foo'});
    const obj3 = new Parse.Object('NewClass', {stringValue: 'bar'});
    await Parse.Object.saveAll([ obj, obj2, obj3 ]);
    const res = await graphql(schema, `
    query findThem {
      findNewClass(where: { stringValue: { eq: "baz" } }) {
        edges {
          cursor
          node {
            id
            objectId
            stringValue
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }
    }
    `, root, context);
    expect(res.errors).toBeUndefined();
    const {
      edges,
      pageInfo
    } = res.data.findNewClass;
    expect(edges.length).toBe(1);
    expect(edges[0].cursor).toBeDefined();
    expect(edges[0].node.objectId).toBe(obj.id);
    expect(pageInfo).toEqual({
      hasNextPage: false,
      hasPreviousPage: false
    });
  });

  async function makeObjects(amount) {
    const objects = [];
    while (objects.length != amount) {
      const obj = new Parse.Object('NewClass', {numberValue: objects.length});
      await obj.save();
      objects.push(obj);
    }
    return objects;
  }

  it('can query with pagninations for firsts', async () => {
    const objects = await makeObjects(20);
    const res = await graphql(schema, `
    query findThem {
      findNewClass(first: 5) {
        edges {
          node {
            id
            createdAt
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }
    }
    `, root, context);
    expect(res.errors).toBeUndefined();
    const {
      edges,
      pageInfo
    } = res.data.findNewClass;
    expect(edges.length).toBe(5);
    edges.forEach((edge, index) => {
      const { node: { createdAt }} = edge;
      expect(createdAt).toEqual(objects[index].createdAt);
    });
    expect(pageInfo).toEqual({
      hasNextPage: true,
      hasPreviousPage: false
    });
  });

  it('can query with pagninations for firsts', async () => {
    const objects = await makeObjects(20);
    const res = await graphql(schema, `
    query findThem {
      findNewClass(last: 5) {
        edges {
          node {
            id
            createdAt
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }
    }
    `, root, context);
    expect(res.errors).toBeUndefined();
    const {
      edges,
      pageInfo
    } = res.data.findNewClass;
    expect(edges.length).toBe(5);
    edges.forEach((edge, index) => {
      const { node: { createdAt }} = edge;
      const idx = objects.length - 1 - index;
      expect(createdAt).toEqual(objects[idx].createdAt);
    });
    expect(pageInfo).toEqual({
      hasNextPage: false,
      hasPreviousPage: true
    });
  });

  it('can query with pagninations with before', async () => {
    const objects = await makeObjects(20);
    const cursor = new Buffer(objects[5].createdAt.toISOString()).toString('base64');
    const res = await graphql(schema, `
    query findThem($cursor: String) {
      findNewClass(before: $cursor) {
        edges {
          node {
            objectId
            createdAt
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }
    }
    `, root, context, { cursor });
    expect(res.errors).toBeUndefined();
    const {
      edges,
      pageInfo
    } = res.data.findNewClass;
    expect(edges.length).toBe(5);
    edges.forEach((edge, index) => {
      const { node: { createdAt, objectId }} = edge;
      expect(createdAt).toEqual(objects[index].createdAt);
      expect(objectId).toEqual(objects[index].id);
    });
    expect(pageInfo).toEqual({
      hasNextPage: true,
      hasPreviousPage: false
    });
  });

  it('can query with pagninations with after', async () => {
    const objects = await makeObjects(20);
    const cursor = new Buffer(objects[15].createdAt.toISOString()).toString('base64');
    const res = await graphql(schema, `
    query findThem($cursor: String) {
      findNewClass(after: $cursor) {
        edges {
          node {
            id
            createdAt
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }
    }
    `, root, context, { cursor });
    expect(res.errors).toBeUndefined();
    const {
      edges,
      pageInfo
    } = res.data.findNewClass;
    expect(edges.length).toBe(4);
    edges.forEach((edge, index) => {
      const { node: { createdAt }} = edge;
      const idx = index + 16;
      expect(createdAt).toEqual(objects[idx].createdAt);
    });
    expect(pageInfo).toEqual({
      hasNextPage: false,
      hasPreviousPage: true
    });
  });

  it('Gets object from Node', async () => {
    const obj = new Parse.Object('OtherClass', {otherString: 'aStringValue'});
    await obj.save();
    const result = await graphql(schema, `
      query myQuery($id: ID!) {
        node(id: $id) {
          ... on OtherClass {
            objectId,
            otherString
          }
        }
      }
      `, root, context, { id: new Buffer(`OtherClass::${obj.id}`).toString('base64') });
    expect(result.errors).toBeUndefined();
    expect(result.data.node.otherString).toBe('aStringValue');
    expect(result.data.node.objectId).toBe(obj.id);
  });

  it('Updates objects', async () => {
    const obj = new Parse.Object('OtherClass', {otherString: 'baz'});
    await obj.save();
    const result = await graphql(schema, `
      mutation myMutation($input: UpdateOtherClassInput!) {
        updateOtherClass(input: $input) {
          object {
            objectId,
            otherString
          }
        }
      }
      `, root, context, {input: { objectId: obj.id, otherString: 'newStringValue'}});
    expect(result.errors).toBeUndefined();
    expect(result.data.updateOtherClass.object.otherString).toBe('newStringValue');
  });

  it('Updates objects with uniqueID', async () => {
    const obj = new Parse.Object('OtherClass', {otherString: 'baz'});
    const nc = new Parse.Object('NewClass', {stringValue: 'aString'});
    await Parse.Object.saveAll([obj, nc]);
    const input = {
      id: new Buffer(`OtherClass::${obj.id}`).toString('base64'),
      otherString: 'newStringValue',
      newClass: { objectId: nc.id },
    };
    const result = await graphql(schema, `
      mutation myMutation($input: UpdateOtherClassInput!) {
        updateOtherClass(input: $input) {
          object {
            objectId,
            otherString
            newClass {
              stringValue
            }
          }
        }
      }
      `, root, context, { input });
    expect(result.errors).toBeUndefined();
    expect(result.data.updateOtherClass.object.otherString).toBe('newStringValue');
    expect(result.data.updateOtherClass.object.objectId).toBe(obj.id);
    expect(result.data.updateOtherClass.object.newClass.stringValue).toBe('aString');
  });

  it('fails to update object without id', async () => {
    const result = await graphql(schema, `
    mutation myMutation($input: UpdateOtherClassInput!) {
      updateOtherClass(input: $input) {
        object {
          objectId,
          otherString
        }
      }
    }
    `, root, context, {input: {otherString: 'newStringValue'}});
    expect(result.errors).not.toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toBe('id or objectId are required');
  });

  it('Destroy objects', async (done) => {
    const obj = new Parse.Object('OtherClass', {stringValue: 'baz'});
    const nc = new Parse.Object('NewClass', {stringValue: 'hello'});
    await Parse.Object.saveAll([obj, nc])
    nc.set('other', obj);
    obj.set('baz', nc);
    await Parse.Object.saveAll([obj, nc]);
    const result = await graphql(schema, `
      mutation myMutation($id: ID!) {
        destroyNewClass(input: { objectId: $id }) {
          object {
            objectId,
            stringValue
          }
        }
      }
      `, root, context, {id: nc.id});
    expect(result.errors).toBeUndefined();
    expect(result.data.destroyNewClass.object).toEqual({
      objectId: nc.id,
      stringValue: 'hello'
    });

    const newClassObject = await graphql(schema, `
      query getNewClass($id: ID!) {
        NewClass(objectId: $id) {
          objectId,
          stringValue
        }
      }
      `, root, context, {id: nc.id});
    expect(newClassObject.data.NewClass).toBeNull();
    done();
  });

  describe('utilities', () => {
    it('ensures containsOnlyIdFields works', () => {
      expect(containsOnlyIdFields(['id'])).toBeTruthy();
      expect(containsOnlyIdFields(['objectId'])).toBeTruthy()
      expect(containsOnlyIdFields(['id', 'objectId'])).toBeTruthy();
      expect(containsOnlyIdFields(['objectId', 'yolo'])).toBeFalsy();
      expect(containsOnlyIdFields(['yolo'])).toBeFalsy();
      expect(containsOnlyIdFields(['yolo', 'id'])).toBeFalsy();
    });

    it('should transform key and not value', () => {
      const anyObject = Object.create(null);
      const { key, value } = transformQueryConstraint('anyKey', anyObject);
      expect(key).toBe('$anyKey');
      expect(value).toBe(value); // this is not a copy!
    });

    it('should transform nearSphere and not value', () => {
      const anyObject = Object.create(
        {
          point: {
            latitude: 21,
            longitude: 42,
          }
        }
      );
      const { key, value } = transformQueryConstraint('nearSphere', anyObject);
      expect(key).toBe('$nearSphere');
      expect(value).toEqual({
        latitude: 21,
        longitude: 42,
      }); // this is not a copy!
    });

    it('should not transform non object results', () => {
      const result = transformResult('MyClassName', {
        key: 'value',
      });
      expect(result).toEqual({
        className: 'MyClassName',
        key: 'value'
      });
    });

    it('should throw on invalid IDs with no separators', () => {
      const invalidID = new Buffer('MyThingabc').toString('base64');
      expect(() => parseID(invalidID)).toThrowError('Invalid ID');
    });

    it('should throw on invalid IDs with bad separators', () => {
      const invalidID = new Buffer('MyThing-abc').toString('base64');
      expect(() => parseID(invalidID)).toThrowError('Invalid ID');
    });

    it('should throw on invalid IDs with too many separators', () => {
      const invalidID = new Buffer('MyThing::abc::').toString('base64');
      expect(() => parseID(invalidID)).toThrowError('Invalid ID');
    });
  });
});
