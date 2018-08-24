import {
  GraphQLString,
  GraphQLFloat,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
} from 'graphql'

import {
  GraphQLACL,
  GraphQLACLInput
} from './ACL';

import {
  GraphQLGeoPoint,
  GraphQLGeoPointInput,
  GraphQLGeoPointQuery,
  GeoPoint,
} from './GeoPoint';

import {
  GraphQLFile
} from './File';

import {
  GraphQLDate,
  DateQuery,
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

import {
  NumberInput,
} from './NumberInput';

import {
  PageInfo
} from './PageInfo';

export {
  GraphQLACL,
  GraphQLACLInput,
  GraphQLGeoPoint,
  GraphQLGeoPointInput,
  GraphQLFile,
  GraphQLDate,
  GraphQLPointer,
  GraphQLJSONObject,
  PageInfo,
}

export function type(fieldName, field) {
  if (fieldName === 'objectId' || fieldName === 'id') {
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
  } else if (type == 'Pointer') {
    return GraphQLPointer;
  } else if (type == 'Object') {
    return GraphQLJSONObject;
  } else if (type === 'Array') {
    return new GraphQLList(GraphQLJSONObject);
  }
}

export function inputType(fieldName, field) {
  if (fieldName === 'objectId' || fieldName === 'id') {
    return new GraphQLNonNull(GraphQLID);
  }
  const type = field.type;
  if (type == 'String') {
    return GraphQLString;
  } if (type == 'Number') {
    return NumberInput;
  } if (type == 'Boolean') {
    return GraphQLBoolean;
  } if (type == 'GeoPoint') {
    return GeoPoint;
  } if (type == 'File') {
    // TODO: How to set a file in an object
    // return GraphQLFile;
  } else if (type == 'ACL') {
    return GraphQLACLInput;
  } else if (type == 'Date') {
    return DateQuery;
  } else if (type == 'Pointer') {
    return GraphQLPointerInput(field);
  } else if (type === 'Array') {
    return new GraphQLList(GraphQLJSONObject);
  }
}

export function queryType(fieldName, field) {
  if (fieldName === 'objectId' || fieldName === 'id') {
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
    return GraphQLGeoPointQuery;
  } if (type == 'File') {
    // Cannot query on files
    return;
  } else if (type == 'ACL') {
    // cannot query on ACL!
    return;
  } else if (type == 'Date') {
    return DateQuery;
  } else if (type == 'Pointer') {
    return GraphQLPointerInput(field);
  }
}
