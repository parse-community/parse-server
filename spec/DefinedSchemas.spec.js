// eslint-disable-next-line no-unused-vars
import { DefinedSchemas } from '../lib/DefinedSchemas';

// eslint-disable-next-line no-unused-vars
const Toto = {
  className: 'Toto',
  fields: {
    objectId: { type: 'String' },
    createdAt: {
      type: 'Date',
    },
    updatedAt: {
      type: 'Date',
    },
    ACL: { type: 'ACL' },
    string: { type: 'String' },
    number: { type: 'Number' },
    pointer: { type: 'Pointer', targetClass: 'Pointer' },
    relation: { type: 'Relation', targetClass: 'Relation' },
    email: { type: 'String' },
  },
  indexes: {
    objectId: { objectId: 1 },
    string: { string: 1 },
    complex: { string: 1, number: 1 },
  },
  classLevelPermissions: {
    addField: {},
    create: { '*': true, 'role:ARole': false },
  },
};

describe('DefinedSchemas', () => {
  describe('Fields', () => {
    xit('should keep default fields if not provided');
    xit('should throw if user touch default fields');
    xit('should create new fields');
    xit('should delete removed fields');
    xit('should re create fields with changed type');
    xit('should just update fields with changed params');
    describe('User', () => {
      xit('should protect default fields');
    });
    describe('Role', () => {
      xit('should protect default fields');
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
  });

  xit('should disable class endpoint when schemas provided to avoid dual source of truth');
  xit('should only enable delete class endpoint since');
  xit('should run beforeSchemasMigration before execution of DefinedSchemas');
});
