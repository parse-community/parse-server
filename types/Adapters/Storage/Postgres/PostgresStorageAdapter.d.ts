export var __esModule: boolean;
export default _default;
export class PostgresStorageAdapter {
    constructor({ uri, collectionPrefix, databaseOptions }: {
        uri: any;
        collectionPrefix?: string;
        databaseOptions?: {};
    });
    _collectionPrefix: string;
    enableSchemaHooks: boolean;
    _client: import("pg-promise").IDatabase<{}, import("pg-promise/typescript/pg-subset").IClient>;
    _onchange: () => void;
    _pgp: import("pg-promise").IMain<{}, import("pg-promise/typescript/pg-subset").IClient>;
    _uuid: any;
    canSortOnJoinTables: boolean;
    watch(callback: any): void;
    createExplainableQuery(query: any, analyze?: boolean): string;
    handleShutdown(): void;
    _listenToSchema(): Promise<void>;
    _stream: import("pg-promise").IConnected<{}, import("pg-promise/typescript/pg-subset").IClient>;
    _notifySchemaChange(): void;
    _ensureSchemaCollectionExists(conn: any): Promise<void>;
    classExists(name: any): Promise<any>;
    setClassLevelPermissions(className: any, CLPs: any): Promise<void>;
    setIndexesWithSchemaFormat(className: any, submittedIndexes: any, existingIndexes: {}, fields: any, conn: any): Promise<void>;
    createClass(className: any, schema: any, conn: any): Promise<any>;
    createTable(className: any, schema: any, conn: any): Promise<any>;
    schemaUpgrade(className: any, schema: any, conn: any): Promise<void>;
    addFieldIfNotExists(className: any, fieldName: any, type: any, conn: any): Promise<void>;
    deleteClass(className: any): Promise<boolean>;
    deleteAllClasses(): Promise<void>;
    deleteFields(className: any, schema: any, fieldNames: any): Promise<void>;
    getAllClasses(): Promise<{
        className: any;
        fields: any;
        classLevelPermissions: Readonly<{
            find: {
                '*': boolean;
            };
            get: {
                '*': boolean;
            };
            count: {
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
    }[]>;
    getClass(className: any): Promise<{
        className: any;
        fields: any;
        classLevelPermissions: Readonly<{
            find: {
                '*': boolean;
            };
            get: {
                '*': boolean;
            };
            count: {
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
    }>;
    createObject(className: any, schema: any, object: any, transactionalSession: any): Promise<any>;
    deleteObjectsByQuery(className: any, schema: any, query: any, transactionalSession: any): Promise<any>;
    findOneAndUpdate(className: any, schema: any, query: any, update: any, transactionalSession: any): Promise<any>;
    updateObjectsByQuery(className: any, schema: any, query: any, update: any, transactionalSession: any): Promise<any>;
    upsertOneObject(className: any, schema: any, query: any, update: any, transactionalSession: any): Promise<any>;
    find(className: any, schema: any, query: any, { skip, limit, sort, keys, caseInsensitive, explain }: {
        skip: any;
        limit: any;
        sort: any;
        keys: any;
        caseInsensitive: any;
        explain: any;
    }): Promise<any[]>;
    postgresObjectToParseObject(className: any, object: any, schema: any): any;
    ensureUniqueness(className: any, schema: any, fieldNames: any): Promise<void>;
    count(className: any, schema: any, query: any, readPreference: any, estimate?: boolean): Promise<number>;
    distinct(className: any, schema: any, query: any, fieldName: any): Promise<any[]>;
    aggregate(className: any, schema: any, pipeline: any, readPreference: any, hint: any, explain: any): Promise<any[]>;
    performInitialization({ VolatileClassesSchemas }: {
        VolatileClassesSchemas: any;
    }): Promise<void>;
    createIndexes(className: any, indexes: any, conn: any): Promise<any>;
    createIndexesIfNeeded(className: any, fieldName: any, type: any, conn: any): Promise<void>;
    dropIndexes(className: any, indexes: any, conn: any): Promise<void>;
    getIndexes(className: any): Promise<any[]>;
    updateSchemaWithIndexes(): Promise<void>;
    updateEstimatedCount(className: any): Promise<null>;
    createTransactionalSession(): Promise<any>;
    commitTransactionalSession(transactionalSession: any): any;
    abortTransactionalSession(transactionalSession: any): any;
    ensureIndex(className: any, schema: any, fieldNames: any, indexName: any, caseInsensitive?: boolean, options?: {}): Promise<void>;
}
declare var _default: typeof PostgresStorageAdapter;
