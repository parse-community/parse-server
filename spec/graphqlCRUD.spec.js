const GraphQLParseSchema = require('../lib/graphql/Schema').GraphQLParseSchema;
const Config = require('../lib/Config');
const Auth = require('../lib/Auth').Auth;
const { graphql }  = require('graphql');
const { containsOnlyIdFields } = require('../lib/graphql/execute');

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

describe('graphQLCRUD', () => {
  let schema;
  let root;
  beforeEach(async () => {
    config = Config.get('test');
    const result = await setup(config);
    schema = result.schema;
    root = result.root;
  });

  it('Adds objects', async () => {
    const context = {
      config,
      auth: new Auth({config})
    }
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

  it('Queries objects', (done) => {
    const context = {
      config,
      auth: new Auth({config})
    }
    const publicACL = new Parse.ACL();
    publicACL.setPublicReadAccess(true);
    publicACL.setPublicWriteAccess(true);
    const obj = new Parse.Object('OtherClass', {stringValue: 'baz'});
    const nc = new Parse.Object('NewClass', {stringValue: 'hello'});
    nc.setACL(publicACL);
    return Parse.Object.saveAll([obj, nc]).then(() => {
      nc.relation('others').add(obj);
      obj.set('newClass', nc);
      return Parse.Object.saveAll([obj, nc]);
    }).then(() => {
      return graphql(schema, `
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
      `,root, context)
    }).then((res) => {
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
    }).then(done).catch(done.fail);
  });

  it('Gets object from Node', async () => {
    const context = {
      config,
      auth: new Auth({config})
    }
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
    const context = {
      config,
      auth: new Auth({config})
    }
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
    const context = {
      config,
      auth: new Auth({config})
    }
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
    const context = {
      config,
      auth: new Auth({config})
    }

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
    const context = {
      config,
      auth: new Auth({config})
    }
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
});

describe('Pointer fetching', () => {
  it('ensures containsOnlyIdFields works', () => {
    expect(containsOnlyIdFields(['id'])).toBeTruthy();
    expect(containsOnlyIdFields(['objectId'])).toBeTruthy()
    expect(containsOnlyIdFields(['id', 'objectId'])).toBeTruthy();
    expect(containsOnlyIdFields(['objectId', 'yolo'])).toBeFalsy();
    expect(containsOnlyIdFields(['yolo'])).toBeFalsy();
    expect(containsOnlyIdFields(['yolo', 'id'])).toBeFalsy();
  });
});
