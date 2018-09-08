import {
  GraphQLString,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
} from 'graphql';

import { ACL, ACLInput } from './ACL';

import { GeoPoint, GeoPointInput, GeoPointQuery } from './GeoPoint';

import { File, FileInput } from './File';

import { Date, DateQuery } from './Date';

import { Pointer, PointerInput } from './Pointer';

import { JSONObject } from './JSONObject';

import { StringQuery } from './StringQuery';

import { NumberQuery } from './NumberQuery';

import { NumberInput } from './NumberInput';

import { PageInfo } from './PageInfo';

export {
  ACL,
  ACLInput,
  GeoPoint,
  GeoPointInput,
  File,
  FileInput,
  Date,
  Pointer,
  JSONObject,
  PageInfo,
};

const types = {
  String: GraphQLString,
  Number: GraphQLFloat,
  Boolean: GraphQLBoolean,
  GeoPoint,
  File,
  ACL,
  Date,
  Pointer,
  Object: JSONObject,
  Array: new GraphQLList(JSONObject),
};

export function type({ type }) {
  return types[type];
}

export function inputType(field) {
  const { type } = field;
  if (type == 'String') {
    return GraphQLString;
  }
  if (type == 'Number') {
    return NumberInput;
  }
  if (type == 'Boolean') {
    return GraphQLBoolean;
  }
  if (type == 'GeoPoint') {
    return GeoPointInput;
  }
  if (type == 'File') {
    return FileInput;
  } else if (type == 'ACL') {
    return ACLInput;
  } else if (type == 'Date') {
    return Date;
  } else if (type == 'Pointer') {
    return PointerInput(field);
  } else if (type === 'Array') {
    return new GraphQLList(JSONObject);
  }
}

export function queryType(field) {
  const { type } = field;
  if (type == 'String') {
    return StringQuery;
  }
  if (type == 'Number') {
    return NumberQuery;
  }
  if (type == 'Boolean') {
    return GraphQLBoolean;
  }
  if (type == 'GeoPoint') {
    return GeoPointQuery;
  }
  if (type == 'File') {
    // Cannot query on files
    return;
  } else if (type == 'ACL') {
    // cannot query on ACL!
    return;
  } else if (type == 'Date') {
    return DateQuery;
  } else if (type == 'Pointer') {
    return PointerInput(field);
  }
}
