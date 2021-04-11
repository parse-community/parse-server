export = DatabaseController;
declare class DatabaseController {
    constructor(adapter: any);
    adapter: any;
    schemaPromise: any;
    _transactionalSession: any;
    collectionExists(className: any): any;
    purgeCollection(className: any): any;
    validateClassName(className: any): Promise<void>;
    loadSchema(options?: {
        clearCache: boolean;
    }): any;
    loadSchemaIfNeeded(schemaController: any, options?: {
        clearCache: boolean;
    }): any;
    redirectClassNameForKey(className: any, key: any): any;
    validateObject(className: any, object: any, query: any, runOptions: any): any;
    update(className: any, query: any, update: any, { acl, many, upsert, addsField }: {
        acl: any;
        many: any;
        upsert: any;
        addsField: any;
    }, skipSanitization: boolean, validateOnly: boolean, validSchemaController: any): any;
    collectRelationUpdates(className: any, objectId: any, update: any): any[];
    handleRelationUpdates(className: any, objectId: any, update: any, ops: any): Promise<any[]>;
    addRelation(key: any, fromClassName: any, fromId: any, toId: any): any;
    removeRelation(key: any, fromClassName: any, fromId: any, toId: any): any;
    destroy(className: any, query: any, { acl }: {
        acl: any;
    }, validSchemaController: any): any;
    create(className: any, object: any, { acl }: {
        acl: any;
    }, validateOnly: boolean, validSchemaController: any): Promise<any>;
    canAddField(schema: any, className: any, object: any, aclGroup: any, runOptions: any): any;
    /**
     * Delete all classes and clears the schema cache
     *
     * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
     * @returns {Promise<void>} when the deletions completes
     */
    deleteEverything(fast?: boolean): Promise<void>;
    relatedIds(className: any, key: any, owningId: any, queryOptions: any): any;
    owningIds(className: any, key: any, relatedIds: any): any;
    reduceInRelation(className: any, query: any, schema: any): Promise<any>;
    reduceRelationKeys(className: any, query: any, queryOptions: any): any;
    addInObjectIdsIds(ids: any, query: any): any;
    addNotInObjectIdsIds(ids: any[], query: any): any;
    find(className: any, query: any, { skip, limit, acl, sort, count, keys, op, distinct, pipeline, readPreference, hint, caseInsensitive, explain }: {
        skip: any;
        limit: any;
        acl: any;
        sort?: {};
        count: any;
        keys: any;
        op: any;
        distinct: any;
        pipeline: any;
        readPreference: any;
        hint: any;
        caseInsensitive?: boolean;
        explain: any;
    }, auth: {}, validSchemaController: any): any;
    deleteSchema(className: any): any;
    objectToEntriesStrings(query: any): string[];
    reduceOrOperation(query: any): any;
    reduceAndOperation(query: any): any;
    addPointerPermissions(schema: any, className: any, operation: any, query: any, aclGroup?: any[]): any;
    addProtectedFields(schema: any, className: any, query?: {}, aclGroup?: any[], auth?: {}, queryOptions?: {}): any;
    createTransactionalSession(): any;
    commitTransactionalSession(): any;
    abortTransactionalSession(): any;
    performInitialization(): Promise<void>;
}
declare namespace DatabaseController {
    export { validateQuery as _validateQuery };
}
declare function validateQuery(query: any): void;
