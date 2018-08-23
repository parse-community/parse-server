import {
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLList,
  // GraphQLString,
  // GraphQLNonNull,
  // GraphQLBoolean,
  // GraphQLID,
} from 'graphql'

import {
  queryType,
  inputType,
  type,
  // GraphQLGeoPoint,
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

let ParseClassCache = {};

export function loadClass(className, schema) {
  if (!ParseClassCache[className]) {
    const c = new ParseClass(className, schema);
    const objectType = c.graphQLObjectType();
    const inputType = c.graphQLInputObjectType();
    const updateType = c.graphQLUpdateInputObjectType();
    const queryType = c.graphQLQueryInputObjectType();
    const queryResultType = c.graphQLQueryResultType(objectType);
    const mutationResultType = c.graphQLMutationResultType(objectType);
    ParseClassCache[className] = { objectType, inputType, updateType, queryType, queryResultType, mutationResultType, class: c }
  }
  return ParseClassCache[className];
}

export function clearCache() {
  ParseClassCache = {};
}

const reservedFieldNames = ['objectId', 'createdAt', 'updatedAt'];

export const ParseObjectInterface = new GraphQLInterfaceType({
  name: 'ParseObject',
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
      name: this.className,
      description: `Parse Class ${className}`,
      interfaces: [ParseObjectInterface],
      fields: this.buildFields(graphQLField, false, true),
      resolve: () => {
        return;
      },
      isTypeOf: function(a) {
        return a.className == className;
      }
    };
  }

  buildFields(mapper, filterReserved = false, isQuery = false) {
    const fields = this.class.fields;
    return Object.keys(fields).reduce((memo, fieldName) => {
      if (filterReserved && reservedFieldNames.indexOf(fieldName) >= 0) {
        return memo;
      }
      const field = fields[fieldName];
      let gQLField = mapper(fieldName, field);
      if (field.type == 'Pointer' && isQuery) {
        gQLField = {
          type: loadClass(field.targetClass, this.schema).objectType
        }
      }
      if (!gQLField) {
        return memo;
      }
      memo[fieldName] = gQLField;
      return memo;
    }, {});
  }

  graphQLInputConfig() {
    const className = this.className;
    return {
      name: this.className + 'Input',
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
      name: this.className + 'Query',
      description: `Parse Class ${className} Query`,
      fields: () => {
        const fields = this.buildFields(graphQLQueryField, false, true);
        delete fields.objectId;
        return fields;
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
      name: this.className + 'Update',
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

  graphQLQueryResultType(objectType) {
    return new GraphQLObjectType({
      name: `${this.className}QueryResponse`,
      fields: {
        objects: { type: new GraphQLList(objectType) },
      }
    });
  }

  graphQLMutationResultType(objectType) {
   return new GraphQLObjectType({
      name: `${this.className}MutationCompletePayload`,
      fields: {
        object: { type: objectType }
      }
    });
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

