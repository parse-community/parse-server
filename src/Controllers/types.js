export type LoadSchemaOptions = {
  clearCache: boolean
};

export type SchemaField = {
  type: string;
  targetClass?: ?string;
}

export type SchemaFields = { [string]: SchemaField }

export type Schema = {
  className: string,
  fields: SchemaFields,
  classLevelPermissions: ClassLevelPermissions,
  indexes?: ?any
};

export type ClassLevelPermissions = {
  find?: {[string]: boolean};
  count?: {[string]: boolean};
  get?: {[string]: boolean};
  create?: {[string]: boolean};
  update?: {[string]: boolean};
  delete?: {[string]: boolean};
  addField?: {[string]: boolean};
  readUserFields?: string[];
  writeUserFields?: string[];
};
