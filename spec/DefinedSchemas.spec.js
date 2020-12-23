const { DefinedSchemas } = require('../lib/DefinedSchemas');
const Config = require('../lib/Config');

fdescribe('DefinedSchemas', () => {
  beforeEach(async () => {
    const config = Config.get('test');
    await config.database.adapter.deleteAllClasses();
  });

  describe('Fields', () => {
    it('should keep default fields if not provided', async () => {
      const server = await reconfigureServer();
      // Will perform create
      await new DefinedSchemas([{ className: 'Test' }], server.config).execute();
      // await server.config.databaseController.schemaCache.clear();
      let schema = await new Parse.Schema('Test').get();
      const expectedFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
      };
      expect(schema.fields).toEqual(expectedFields);

      await server.config.databaseController.schemaCache.clear();
      // Will perform update
      await new DefinedSchemas([{ className: 'Test' }], server.config).execute();
      schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(expectedFields);
    });
    it('should protect default fields', async () => {
      const server = await reconfigureServer();

      const schemas = [
        {
          className: '_User',
          fields: {
            email: 'Object',
          },
        },
        {
          className: '_Role',
          fields: {
            users: 'Object',
          },
        },
        {
          className: '_Installation',
          fields: {
            installationId: 'Object',
          },
        },
        {
          className: 'Test',
          fields: {
            createdAt: { type: 'Object' },
            objectId: { type: 'Number' },
            updatedAt: { type: 'String' },
            ACL: { type: 'String' },
          },
        },
      ];

      const expectedFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
      };

      const expectedUserFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
        username: { type: 'String' },
        password: { type: 'String' },
        email: { type: 'String' },
        emailVerified: { type: 'Boolean' },
        authData: { type: 'Object' },
      };

      const expectedRoleFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
        name: { type: 'String' },
        users: { type: 'Relation', targetClass: '_User' },
        roles: { type: 'Relation', targetClass: '_Role' },
      };

      const expectedInstallationFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
        installationId: { type: 'String' },
        deviceToken: { type: 'String' },
        channels: { type: 'Array' },
        deviceType: { type: 'String' },
        pushType: { type: 'String' },
        GCMSenderId: { type: 'String' },
        timeZone: { type: 'String' },
        localeIdentifier: { type: 'String' },
        badge: { type: 'Number' },
        appVersion: { type: 'String' },
        appName: { type: 'String' },
        appIdentifier: { type: 'String' },
        parseVersion: { type: 'String' },
      };

      // Perform create
      await new DefinedSchemas(schemas, server.config).execute();
      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(expectedFields);

      let userSchema = await new Parse.Schema('_User').get();
      expect(userSchema.fields).toEqual(expectedUserFields);

      let roleSchema = await new Parse.Schema('_Role').get();
      expect(roleSchema.fields).toEqual(expectedRoleFields);

      let installationSchema = await new Parse.Schema('_Installation').get();
      expect(installationSchema.fields).toEqual(expectedInstallationFields);

      await server.config.databaseController.schemaCache.clear();
      // Perform update
      await new DefinedSchemas(schemas, server.config).execute();
      schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(expectedFields);

      userSchema = await new Parse.Schema('_User').get();
      expect(userSchema.fields).toEqual(expectedUserFields);

      roleSchema = await new Parse.Schema('_Role').get();
      expect(roleSchema.fields).toEqual(expectedRoleFields);

      installationSchema = await new Parse.Schema('_Installation').get();
      expect(installationSchema.fields).toEqual(expectedInstallationFields);
    });
    it('should create new fields', async () => {
      const server = await reconfigureServer();
      const fields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
        aString: { type: 'String' },
        aStringWithDefault: { type: 'String', defaultValue: 'Test' },
        aStringWithRequired: { type: 'String', required: true },
        aStringWithRequiredAndDefault: { type: 'String', required: true, defaultValue: 'Test' },
        aBoolean: { type: 'Boolean' },
        aFile: { type: 'File' },
        aNumber: { type: 'Number' },
        aRelation: { type: 'Relation', targetClass: '_User' },
        aPointer: { type: 'Pointer', targetClass: '_Role' },
        aDate: { type: 'Date' },
        aGeoPoint: { type: 'GeoPoint' },
        aPolygon: { type: 'Polygon' },
        aArray: { type: 'Array' },
        aObject: { type: 'Object' },
      };
      const schemas = [
        {
          className: 'Test',
          fields,
        },
      ];

      // Create
      await new DefinedSchemas(schemas, server.config).execute();
      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(fields);

      await server.config.databaseController.schemaCache.clear();
      // Update
      await new DefinedSchemas(schemas, server.config).execute();
      schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(fields);
    });
    it('should delete removed fields', async () => {
      const server = await reconfigureServer();

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'String' } } }],
        server.config
      ).execute();

      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toBeDefined();

      await new DefinedSchemas([{ className: 'Test' }], server.config).execute();

      schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual({
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
      });
    });
    it('should re create fields with changed type', async () => {
      const server = await reconfigureServer();

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'String' } } }],
        server.config
      ).execute();

      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toEqual({ type: 'String' });

      const object = new Parse.Object('Test');
      await object.save({ aField: 'Hello' }, { useMasterKey: true });

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'Number' } } }],
        server.config
      ).execute();

      schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toEqual({ type: 'Number' });

      await object.fetch({ useMasterKey: true });
      expect(object.get('aField')).toBeUndefined();
    });
    it('should just update classic fields with changed params', async () => {
      const server = await reconfigureServer();

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'String' } } }],
        server.config
      ).execute();

      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toEqual({ type: 'String' });

      const object = new Parse.Object('Test');
      await object.save({ aField: 'Hello' }, { useMasterKey: true });

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'String', required: true } } }],
        server.config
      ).execute();

      schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toEqual({ type: 'String', required: true });

      await object.fetch({ useMasterKey: true });
      expect(object.get('aField')).toEqual('Hello');
    });
  });

  describe('Indexes', () => {
    xit('should create new indexes');
    xit('should re create changed indexes');
    xit('should delete removed indexes');
    describe('User', () => {
      xit('should protect default indexes');
    });
    describe('Role', () => {
      xit('should protect default indexes');
    });
  });

  describe('ClassLevelPermissions', () => {
    xit('should save CLP');
    xit('should force disabled addField');
  });

  xit('should disable class endpoint when schemas provided to avoid dual source of truth');
  xit('should only enable delete class endpoint since');
  xit('should run beforeSchemasMigration before execution of DefinedSchemas');
});
