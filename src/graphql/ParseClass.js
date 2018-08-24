import { runFind, runGet, transformResult } from './execute';

import {
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLID,
} from 'graphql'

import {
  queryType,
  inputType,
  type,
  GraphQLPointer,
  PageInfo,
} from './types'

import {
  getOrElse,
  clearCache,
} from './typesCache';

export { clearCache };

function graphQLField(fieldName, field) {
  const gQLType = type(fieldName, field);
  if (!gQLType) {
    return;
  }
  const fieldType = (gQLType === GraphQLPointer ? `Pointer<${field.targetClass}>` : `${field.type}`);
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

export function loadClass(className, schema) {
  const c = getOrElse(className, () => new ParseClass(className, schema));
  const objectType = c.graphQLObjectType();
  const inputType = c.graphQLInputObjectType();
  const updateType = c.graphQLUpdateInputObjectType();
  const queryType = c.graphQLQueryInputObjectType();
  const queryResultType = c.graphQLQueryResultType(objectType);
  const mutationResultType = c.graphQLMutationResultType(objectType);
  return { objectType, inputType, updateType, queryType, queryResultType, mutationResultType, class: c }
}

const reservedFieldNames = ['objectId', 'createdAt', 'updatedAt'];

export const Node = new GraphQLInterfaceType({
  name: 'Node',
  fields: {
    id: {
      type: type('objectId')
    }
  }
})

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

  buildFields(mapper, filterReserved = false, isQuery = false, isObject = false) {
    const fields = this.class.fields;
    const fieldsMap = Object.keys(fields).reduce((memo, fieldName) => {
      if (filterReserved && reservedFieldNames.indexOf(fieldName) >= 0) {
        return memo;
      }
      const field = fields[fieldName];
      let gQLField = mapper(fieldName, field);
      if (field.type == 'Pointer') {
        if (isQuery) {
          gQLField = {
            type: loadClass(field.targetClass, this.schema).queryType
          }
        } else if (isObject) {
          // TODO: move pointer resolver somewhere else
          gQLField = {
            type: loadClass(field.targetClass, this.schema).objectType,
            resolve: (parent, args, context, info) => {
              const object = parent[fieldName];
              const selections = info.fieldNodes[0].selectionSet.selections.map((field) => {
                return field.name.value;
              });
              if (selections.indexOf('id') < 0 || selections.length > 1) {
                return runGet(context, info, object.className, object.objectId, this.schema);
              }
              return transformResult(fields[fieldName].targetClass, object, this.schema, { context, info });
            }
          }
        }
      }
      if (field.type == 'Relation' && isObject) {
        // TODO: Move relation resolver somewhere else
        const { queryResultType, queryType } = loadClass(field.targetClass, this.schema);
        gQLField = {
          type: queryResultType,
          args: {
            where: { type: queryType }
          },
          resolve: async (parent, args, context, info) => {
            const query = {
              $relatedTo: {
                object: {
                  __type: 'Pointer',
                  className: parent.className,
                  objectId: parent.objectId
                },
                key: fieldName,
              }
            }
            args.redirectClassNameForKey = fieldName;
            const results = await runFind(context, info, this.className, args, this.schema, query);
            return {
              nodes: () => results,
              edges: () => results.map((node) => {
                return { node };
              }),
              pageInfo: () => {
                return {
                  hasNextPage: false,
                  hasPreviousPage: false
                }
              }
            };
          }
        }
      }

      if (!gQLField) {
        return memo;
      }
      memo[fieldName] = gQLField;
      return memo;
    }, {});
    if (isObject) {
      fieldsMap.id = mapper('objectId', fields['objectId']);
    }
    return fieldsMap;
  }
  graphQLConfig() {
    const className = this.className;
    return {
      name: this.className,
      description: `Parse Class ${className}`,
      interfaces: [Node, ParseObjectInterface],
      fields: () => this.buildFields(graphQLField, false, false, true),
      isTypeOf: (a) => {
        return a.className == className;
      },
    };
  }

  graphQLInputConfig() {
    const className = this.className;
    return {
      name: this.className + 'Input',
      description: `Parse Class ${className} Input`,
      fields: () => {
        return this.buildFields(graphQLInputField, true);
      },
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
        delete fields.id;
        return fields;
      },
      isTypeOf: function(input) {
        return input.className == className;
      }
    };
  }

  graphQLUpdateInputConfig() {
    return {
      name: this.className + 'Update',
      description: `Parse Class ${this.className} Update`,
      fields: () => {
        const fields = this.buildFields(graphQLInputField, true);
        fields.id = { type: GraphQLID };
        fields.objectId = { type: GraphQLID };
        return fields;
      },
      isTypeOf: function(input) {
        return input.className == this.className;
      }
    };
  }

  graphQLUpdateInputObjectType() {
    if (!this.updateInputObjectType) {
      this.updateInputObjectType = new GraphQLInputObjectType(this.graphQLUpdateInputConfig());
    }
    return this.updateInputObjectType;
  }

  graphQLInputObjectType() {
    if (!this.inputObjectType) {
      this.inputObjectType = new GraphQLInputObjectType(this.graphQLInputConfig());
    }
    return this.inputObjectType;
  }

  graphQLQueryInputObjectType() {
    if (!this.queryInputObjectType) {
      this.queryInputObjectType = new GraphQLInputObjectType(this.graphQLQueryConfig());
    }
    return this.queryInputObjectType;
  }

  graphQLQueryResultType() {
    if (!this.queryResultObjectType) {
      const objectType = this.graphQLObjectType();
      this.queryResultObjectType = new GraphQLObjectType({
        name: `${this.className}QueryConnection`,
        fields: {
          nodes: { type: new GraphQLList(objectType) },
          edges: {
            type: new GraphQLList(new GraphQLObjectType({
              name: `${this.className}Edge`,
              fields: () => ({
                node: { type: objectType },
                cursor: { type: GraphQLString }
              })
            }))
          },
          pageInfo: { type: PageInfo },
        }
      });
    }
    return this.queryResultObjectType;
  }

  graphQLMutationResultType() {
    if (!this.mutationResultObjectType) {
      const objectType = this.graphQLObjectType();
      this.mutationResultObjectType = new GraphQLObjectType({
        name: `${this.className}MutationCompletePayload`,
        fields: {
          object: { type: objectType },
          clientMutationId: { type: GraphQLString }
        }
      });
    }
    return this.mutationResultObjectType;
  }


  graphQLObjectType() {
    if (!this.objectType) {
      this.objectType = new GraphQLObjectType(this.graphQLConfig());
    }
    return this.objectType;
  }
}

