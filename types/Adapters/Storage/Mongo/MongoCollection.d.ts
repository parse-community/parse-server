export var __esModule: boolean;
export default MongoCollection;
declare class MongoCollection {
    /**
     * Collation to support case insensitive queries
     */
    static caseInsensitiveCollation(): {
        locale: string;
        strength: number;
    };
    constructor(mongoCollection: any);
    _mongoCollection: any;
    find(query: any, { skip, limit, sort, keys, maxTimeMS, readPreference, hint, caseInsensitive, explain }?: {
        skip: any;
        limit: any;
        sort: any;
        keys: any;
        maxTimeMS: any;
        readPreference: any;
        hint: any;
        caseInsensitive: any;
        explain: any;
    }): any;
    _rawFind(query: any, { skip, limit, sort, keys, maxTimeMS, readPreference, hint, caseInsensitive, explain }?: {
        skip: any;
        limit: any;
        sort: any;
        keys: any;
        maxTimeMS: any;
        readPreference: any;
        hint: any;
        caseInsensitive: any;
        explain: any;
    }): any;
    count(query: any, { skip, limit, sort, maxTimeMS, readPreference, hint }?: {
        skip: any;
        limit: any;
        sort: any;
        maxTimeMS: any;
        readPreference: any;
        hint: any;
    }): any;
    distinct(field: any, query: any): any;
    aggregate(pipeline: any, { maxTimeMS, readPreference, hint, explain }?: {
        maxTimeMS: any;
        readPreference: any;
        hint: any;
        explain: any;
    }): any;
    insertOne(object: any, session: any): any;
    upsertOne(query: any, update: any, session: any): any;
    updateOne(query: any, update: any): any;
    updateMany(query: any, update: any, session: any): any;
    deleteMany(query: any, session: any): any;
    _ensureSparseUniqueIndexInBackground(indexRequest: any): Promise<any>;
    drop(): any;
}
