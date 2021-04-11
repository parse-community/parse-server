export var __esModule: boolean;
export default _default;
declare var _default: typeof MongoSchemaCollection;
declare class MongoSchemaCollection {
    constructor(collection: any);
    _collection: any;
    _fetchAllSchemasFrom_SCHEMA(): any;
    _fetchOneSchemaFrom_SCHEMA(name: any): any;
    findAndDeleteSchema(name: any): any;
    insertSchema(schema: any): any;
    updateSchema(name: any, update: any): any;
    upsertSchema(name: any, query: any, update: any): any;
    addFieldIfNotExists(className: any, fieldName: any, fieldType: any): any;
}
declare namespace MongoSchemaCollection {
    export { mongoSchemaToParseSchema as _TESTmongoSchemaToParseSchema };
    export { parseFieldTypeToMongoFieldType };
}
declare function mongoSchemaToParseSchema(mongoSchema: any): {
    className: any;
    fields: {};
    classLevelPermissions: Readonly<{
        find: {
            '*': boolean;
        };
        count: {
            '*': boolean;
        };
        get: {
            '*': boolean;
        };
        create: {
            '*': boolean;
        };
        update: {
            '*': boolean;
        };
        delete: {
            '*': boolean;
        };
        addField: {
            '*': boolean;
        };
        protectedFields: {
            '*': any[];
        };
    }>;
    indexes: {};
};
declare function parseFieldTypeToMongoFieldType({ type, targetClass }: {
    type: any;
    targetClass: any;
}): string;
