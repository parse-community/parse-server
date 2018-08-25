import {
  GraphQLString,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
} from 'graphql'

import {
  ACL,
} from './ACL';

import {
  GeoPoint,
  GeoPointInput,
  GeoPointQuery,
} from './GeoPoint';

import {
  File
} from './File';

import {
  Date,
  DateQuery,
} from './Date';

import {
  Pointer,
  PointerInput,
} from './Pointer';

import {
  JSONObject,
} from './JSONObject';

import {
  StringQuery,
} from './StringQuery';

import {
  NumberQuery,
} from './NumberQuery';

import {
  NumberInput,
} from './NumberInput';

import {
  PageInfo
} from './PageInfo';

export {
  ACL,
  GeoPoint,
  GeoPointInput,
  File,
  Date,
  Pointer,
  JSONObject,
  PageInfo,
}

export function type({ type }) {
  if (type == 'String') {
    return GraphQLString;
  } if (type == 'Number') {
    return GraphQLFloat;
  } if (type == 'Boolean') {
    return GraphQLBoolean;
  } if (type == 'GeoPoint') {
    return GeoPoint;
  } if (type == 'File') {
    return File;
  } else if (type == 'ACL') {
    return ACL;
  } else if (type == 'Date') {
    return Date;
  } else if (type == 'Pointer') {
    return Pointer;
  } else if (type == 'Object') {
    return JSONObject;
  } else if (type === 'Array') {
    return new GraphQLList(JSONObject);
  }
}

export function inputType(field) {
  const { type } = field;
  if (type == 'String') {
    return GraphQLString;
  } if (type == 'Number') {
    return NumberInput;
  } if (type == 'Boolean') {
    return GraphQLBoolean;
  } if (type == 'GeoPoint') {
    return GeoPointInput;
  } if (type == 'File') {
    // TODO: How to set a file in an object
    // return GraphQLFile;
  } else if (type == 'ACL') {
    return ACL;
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
  } if (type == 'Number') {
    return NumberQuery;
  } if (type == 'Boolean') {
    return GraphQLBoolean;
  } if (type == 'GeoPoint') {
    return GeoPointQuery;
  } if (type == 'File') {
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
