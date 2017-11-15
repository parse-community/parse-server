// @flow
export type SchemaType = any;
export type StorageClass = any;
export type QueryType = any;

export type QueryOptions = {
  skip?: number,
  limit?: number,
  acl?: string[],
  sort?: {[string]: number},
  count?: boolean | number,
  keys?: string[],
  op?: string,
  distinct?: boolean,
  pipeline?: any,
  readPreference?: ?string,
};

export type UpdateQueryOptions = {
  many?: boolean,
  upsert?: boolean
}

export type FullQueryOptions = QueryOptions & UpdateQueryOptions;

export interface StorageAdapter {
  classExists(className: string): Promise<boolean>;
  setClassLevelPermissions(className: string, clps: any): Promise<void>;
  createClass(className: string, schema: SchemaType): Promise<void>;
  addFieldIfNotExists(className: string, fieldName: string, type: any): Promise<void>;
  deleteClass(className: string): Promise<void>;
  deleteAllClasses(): Promise<void>;
  deleteFields(className: string, schema: SchemaType, fieldNames: Array<string>): Promise<void>;
  getAllClasses(): Promise<StorageClass[]>;
  getClass(className: string): Promise<StorageClass>;
  createObject(className: string, schema: SchemaType, object: any): Promise<any>;
  deleteObjectsByQuery(className: string, schema: SchemaType, query: QueryType): Promise<void>;
  updateObjectsByQuery(className: string, schema: SchemaType, query: QueryType, update: any): Promise<[any]>;
  findOneAndUpdate(className: string, schema: SchemaType, query: QueryType, update: any): Promise<any>;
  upsertOneObject(className: string, schema: SchemaType, query: QueryType, update: any): Promise<any>;
  find(className: string, schema: SchemaType, query: QueryType, options: QueryOptions): Promise<[any]>;
  ensureUniqueness(className: string, schema: SchemaType, fieldNames: Array<string>): Promise<void>;
  count(className: string, schema: SchemaType, query: QueryType, readPreference: ?string): Promise<number>;
  distinct(className: string, schema: SchemaType, query: QueryType, fieldName: string): Promise<any>;
  aggregate(className: string, schema: any, pipeline: any, readPreference: ?string): Promise<any>;
  performInitialization(options: ?any): Promise<void>;

  // Indexing
  createIndexes(className: string, indexes: any, conn: ?any): Promise<void>;
  getIndexes(className: string, connection: ?any): Promise<void>;
  updateSchemaWithIndexes(): Promise<void>;
  setIndexesWithSchemaFormat(className: string, submittedIndexes: any, existingIndexes: any, fields: any, conn: ?any): Promise<void>;
}
