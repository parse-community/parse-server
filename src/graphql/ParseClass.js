import {
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLInputObjectType,
  //GraphQLString,
  //GraphQLNonNull,
  //GraphQLBoolean,
  //GraphQLID,
} from 'graphql'

import {
  queryType,
  inputType,
  type,
  //GraphQLGeoPoint,
  GraphQLPointer,
  GraphQLJSONObject
} from './types'

function graphQLField(fieldName, field) {
  const gQLType = type(fieldName, field);
  if (!gQLType) {
    /* eslint-disable */
    console.log('no type: ', fieldName, field);
    return;
  }
  const fieldType = (gQLType === GraphQLPointer ? `Pointer<${field.targetClass}>` :  `${field.type}`);
  return {
    name: fieldName,
    type: gQLType,
    description: `Accessor for ${fieldName} (${fieldType})`,
  };
}

function graphQLInputField(fieldName, field) {
  const gQLType = inputType(fieldName, field);
  if (!gQLType) {
    return;
  }
  const fieldType = (gQLType === GraphQLPointer ? `Pointer<${field.targetClass}>` :  `${field.type}`);
  return {
    name: fieldName,
    type: gQLType,
    description: `Setter for ${fieldName} (${fieldType})`,
  };
}

function graphQLQueryField(fieldName, field) {
  const gQLType = queryType(fieldName, field);
  if (!gQLType) {
    return;
  }
  return {
    name: fieldName,
    type: gQLType,
    description: `Query for ${fieldName} (${field.type})`,
  };
}

const ParseClassCache = {};

export function  loadClass(className, schema) {
  if (!ParseClassCache[className]) {
    const c = new ParseClass(className, schema);
    const objectType = c.graphQLObjectType();
    const inputType = c.graphQLInputObjectType();
    const updateType = c.graphQLUpdateInputObjectType();
    const queryType = c.graphQLQueryInputObjectType()
    ParseClassCache[className] = { objectType, inputType, updateType, queryType, class: c }
  }
  return ParseClassCache[className];
}

const reservedFieldNames = ['objectId', 'createdAt', 'updatedAt'];

export const ParseObjectInterface = new GraphQLInterfaceType({
  name: 'ObjectType',
  fields: {
    objectId: {
      type: type('objectId')
    },
    createdAt: {
      type: type(null, {type: 'Date'})
    },
    updatedAt: {
      type: type(null, {type: 'Date'})
    },
    ACL: {
      type: type(null, {type: 'ACL'})
    }
  }
});

export const ParseObject = new GraphQLObjectType({
  name: 'Object',
  interfaces: [ParseObjectInterface],
  fields: {
    objectId: {
      type: type('objectId')
    },
    createdAt: {
      type: type(null, {type: 'Date'})
    },
    updatedAt: {
      type: type(null, {type: 'Date'})
    },
    ACL: {
      type: type(null, {type: 'ACL'})
    },
    data: {
      type: GraphQLJSONObject
    }
  },
  isTypeOf: (args, context, info) => {
    // Use that type when impossible to map to a Schema type
    return typeof info.schema._typeMap[args.className] === 'undefined';
  },
  resolve: () => {
    /* eslint-disable */
    console.log('RESOLVE CALLED!');
    /* eslint-enable */
  }
});

export class ParseClass {
  schema;
  className;
  class;

  constructor(className, schema) {
    this.className = className;
    this.schema = schema;
    this.class = this.schema[className];
  }

  graphQLConfig() {
    const className = this.className;
    return {
      name: className,
      description: `Parse Class ${className}`,
      interfaces: [ParseObjectInterface],
      fields: () => {
        return this.buildFields(graphQLField);
      },
      resolve: () => {
        return;
      },
      isTypeOf: function(a) {
        return a.className == className;
      }
    };
  }

  buildFields(mapper, filterReserved, defaultValues = {}) {
    const fields = this.class.fields;
    return Object.keys(fields).reduce((memo, fieldName) => {
      if (filterReserved && reservedFieldNames.indexOf(fieldName) >= 0) {
        return memo;
      }
      const field = fields[fieldName];
      const gQLField = mapper(fieldName, field);
      if (!gQLField) {
        if (field.type == 'Pointer') {
          memo[fieldName] = {
            type: loadClass(field.targetClass, this.schema).objectType
          }
        }
        return memo;
      }
      memo[fieldName] = gQLField;
      return memo;
    }, defaultValues);
  }

  graphQLInputConfig() {
    const className = this.className;
    return {
      name: className + 'Input',
      description: `Parse Class ${className} Input`,
      fields: () => {
        return this.buildFields(graphQLInputField, true);
      },
      resolve: this.get.bind(this),
      isTypeOf: function(input) {
        return input.className == className;
      }
    };
  }

  graphQLQueryConfig() {
    const className = this.className;
    return {
      name: className + 'Query',
      description: `Parse Class ${className} Query`,
      fields: () => {
        return this.buildFields(graphQLQueryField, true);
      },
      resolve: this.get.bind(this),
      isTypeOf: function(input) {
        return input.className == className;
      }
    };
  }

  graphQLUpdateInputConfig() {
    const className = this.className;
    return {
      name: className + 'Update',
      description: `Parse Class ${className} Update`,
      fields: () => {
        return this.buildFields(graphQLInputField, true);
      },
      resolve: this.get.bind(this),
      isTypeOf: function(input) {
        return input.className == className;
      }
    };
  }

  graphQLUpdateInputObjectType() {
    return new GraphQLInputObjectType(this.graphQLUpdateInputConfig());
  }

  graphQLInputObjectType() {
    return new GraphQLInputObjectType(this.graphQLInputConfig());
  }

  graphQLQueryInputObjectType() {
    return new GraphQLInputObjectType(this.graphQLQueryConfig());
  }

  graphQLObjectType() {
    return new GraphQLObjectType(this.graphQLConfig());
  }

  get(a,b,c) {
    /*eslint-disable*/
    console.log('ParseClass resolve...');
    console.log(a,b,c);
    /* eslint-enable */
    return null;
  }
}

