// @flow

export type FieldValueType =
  | 'String'
  | 'Boolean'
  | 'File'
  | 'Number'
  | 'Relation'
  | 'Pointer'
  | 'Date'
  | 'GeoPoint'
  | 'Polygon'
  | 'Array'
  | 'Object';

export interface FieldType {
  type: FieldValueType;
  required?: boolean;
  defaultValue?: mixed;
  targetClass?: string;
}

export type CLPType =
  | '*'
  | ('find' | 'count' | 'get' | 'update' | 'create' | 'delete') /*| 'addField'*/[];
type ClassNameType = '_User' | '_Role' | string;

export interface CLPInterface {
  requiresAuthentication?: boolean;
  '*'?: boolean;
}

export interface ProtectedFieldsInterface {
  [key: string]: string[];
}

export interface IndexInterface {
  [key: string]: number;
}

export interface IndexesInterface {
  [key: string]: IndexInterface;
}

export interface MigrationsOptions {
  schemas: JSONSchema[];
  strict: ?boolean;
  deleteExtraFields: ?boolean;
  recreateModifiedFields: ?boolean;
}

export interface JSONSchema {
  className: ClassNameType;
  fields?: { [key: string]: FieldType };
  indexes?: IndexesInterface;
  classLevelPermissions?: {
    find?: CLPInterface,
    count?: CLPInterface,
    get?: CLPInterface,
    update?: CLPInterface,
    create?: CLPInterface,
    delete?: CLPInterface,
    addField?: CLPInterface,
    protectedFields?: ProtectedFieldsInterface,
  };
}

function CLP(ops: CLPType, value: CLPInterface): CLPInterface {
  const v: CLPInterface = {};

  if (ops === '*') {
    ops = ['find', 'count', 'get', 'update', 'create', 'delete'];
  }

  ops.forEach(op => {
    v[op] = value;
  });

  return v;
}

export class CLPHelper {
  static requiresAuthentication(ops: CLPType): CLPInterface {
    return CLP(ops, { requiresAuthentication: true });
  }

  static requiresAnonymous(ops: CLPType): CLPInterface {
    return CLP(ops, { '*': true });
  }
}

export function makeSchema(className: ClassNameType, schema: JSONSchema): JSONSchema {
  // This function solve two things:
  // 1. It provide auto-completion to the users who are implementing schemas
  // 2. It allow forward-compatible point in order to allow future changes to the internal structure of JSONSchema without affecting all the users

  return {
    className,
    ...schema,
  };
}
