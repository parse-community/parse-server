import {
  GraphQLString,
  GraphQLFloat,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLID,
} from 'graphql'

import {
  GraphQLACL,
  GraphQLACLInput
} from './ACL';

import {
  GraphQLGeoPoint,
  GraphQLGeoPointInput
} from './GeoPoint';

import {
  GraphQLFile
} from './File';

import {
  GraphQLDate
} from './Date';

import {
  GraphQLPointer,
  GraphQLPointerInput,
} from './Pointer';

import {
  GraphQLJSONObject,
} from './JSONObject';

import {
  StringQuery,
} from './StringQuery';

import {
  NumberQuery,
} from './NumberQuery';

export {
  GraphQLACL,
  GraphQLACLInput,
  GraphQLGeoPoint,
  GraphQLGeoPointInput,
  GraphQLFile,
  GraphQLDate,
  GraphQLPointer,
  GraphQLJSONObject
}

export function type(fieldName, field) {
  if (fieldName === 'objectId') {
    return new GraphQLNonNull(GraphQLID);
  }
  const type = field.type;
  if (type == 'String') {
    return GraphQLString;
  } if (type == 'Number') {
    return GraphQLFloat;
  } if (type == 'Boolean') {
    return GraphQLBoolean;
  } if (type == 'GeoPoint') {
    return GraphQLGeoPoint;
  } if (type == 'File') {
    return GraphQLFile;
  } else if (type == 'ACL') {
    return GraphQLACL;
  } else if (type == 'Date') {
    return GraphQLDate;
  }
}

export function inputType(fieldName, field) {
  if (fieldName === 'objectId') {
    return new GraphQLNonNull(GraphQLID);
  }
  const type = field.type;
  if (type == 'String') {
    return GraphQLString;
  } if (type == 'Number') {
    return GraphQLFloat;
  } if (type == 'Boolean') {
    return GraphQLBoolean;
  } if (type == 'GeoPoint') {
    return GraphQLGeoPointInput;
  } if (type == 'File') {
    return GraphQLFile;
  } else if (type == 'ACL') {
    return GraphQLACLInput;
  } else if (type == 'Date') {
    return GraphQLDate;
  } else if (type == 'Pointer') {
    return GraphQLPointerInput;
  }
}

export function queryType(fieldName, field) {
  if (fieldName === 'objectId') {
    return new GraphQLNonNull(GraphQLID);
  }
  const type = field.type;
  if (type == 'String') {
    return StringQuery;
  } if (type == 'Number') {
    return NumberQuery;
  } if (type == 'Boolean') {
    return GraphQLBoolean;
  } if (type == 'GeoPoint') {
    return GraphQLGeoPointInput;
  } if (type == 'File') {
    return GraphQLFile;
  } else if (type == 'ACL') {
    return GraphQLACLInput;
  } else if (type == 'Date') {
    return GraphQLDate;
  } else if (type == 'Pointer') {
    return GraphQLPointerInput;
  }
}
