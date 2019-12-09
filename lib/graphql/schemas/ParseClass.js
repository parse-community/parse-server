"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loadClass = loadClass;
exports.getParseClassQueryFields = getParseClassQueryFields;
exports.getParseClassMutationFields = getParseClassMutationFields;
exports.getParseClassSubscriptionField = getParseClassSubscriptionField;
exports.default = exports.ParseClass = void 0;

var _execute = require("../execute");

var _Auth = require("../../Auth");

var _graphql = require("graphql");

var _types = require("../types");

var _Node = require("../types/Node");

var _typesCache = require("../typesCache");

var _ACL = require("../types/ACL");

function handleIdField(fieldName) {
  if (fieldName === 'objectId' || fieldName == 'id') {
    return new _graphql.GraphQLNonNull(_graphql.GraphQLID);
  }
}

function getRelationField(fieldName, field, schema) {
  const {
    find
  } = loadClass(field.targetClass, schema);

  find.resolve = async (parent, args, context, info) => {
    const query = {
      $relatedTo: {
        object: {
          __type: 'Pointer',
          className: parent.className,
          objectId: parent.objectId
        },
        key: fieldName
      }
    };
    args.redirectClassNameForKey = fieldName;
    const results = await (0, _execute.runFind)(context, info, parent.className, args, schema, query);
    results.forEach(result => {
      result.id = (0, _execute.getGloballyUniqueId)(result.className, result.objectId);
    });
    return (0, _execute.connectionResultsArray)(results, args, 100);
  };

  return find;
}

function getFieldType(field) {
  return field.type === 'Pointer' ? `Pointer<${field.targetClass}>` : `${field.type}`;
}

function graphQLField(fieldName, field, schema) {
  if (field.type == 'Relation') {
    return getRelationField(fieldName, field, schema);
  }

  let gQLType = handleIdField(fieldName) || (0, _types.type)(field);
  const fieldType = getFieldType(field);
  let gQLResolve;

  if (field.type === 'Pointer') {
    gQLType = loadClass(field.targetClass, schema).objectType;

    gQLResolve = (parent, args, context, info) => {
      return (0, _execute.resolvePointer)(field.targetClass, parent[fieldName], schema, context, info);
    };
  }

  return {
    name: fieldName,
    type: gQLType,
    resolve: gQLResolve,
    description: `Accessor for ${fieldName} (${fieldType})`
  };
}

function graphQLInputField(fieldName, field) {
  const gQLType = handleIdField(fieldName) || (0, _types.inputType)(field);

  if (!gQLType) {
    return;
  }

  const fieldType = getFieldType(field);
  return {
    name: fieldName,
    type: gQLType,
    description: `Setter for ${fieldName} (${fieldType})`
  };
}

function graphQLQueryField(fieldName, field, schema) {
  let gQLType = handleIdField(fieldName) || (0, _types.queryType)(field);

  if (!gQLType) {
    return;
  }

  if (field.type == 'Pointer') {
    gQLType = loadClass(field.targetClass, schema).queryType;
  }

  return {
    name: fieldName,
    type: gQLType,
    description: `Query for ${fieldName} (${field.type})`
  };
}

function transformInput(input, schema) {
  const {
    fields
  } = schema;
  Object.keys(input).forEach(key => {
    const value = input[key];

    if (fields[key] && fields[key].type === 'Pointer') {
      value.__type = 'Pointer';
    } else if (fields[key] && fields[key].type === 'GeoPoint') {
      value.__type = 'GeoPoint';
    } else if (key === 'ACL') {
      input[key] = (0, _ACL.toParseACL)(value);
    }
  });
  return input;
}

function getObjectId(input) {
  if (!input.id && !input.objectId) {
    throw 'id or objectId are required';
  }

  let objectId;

  if (input.objectId) {
    objectId = input.objectId;
    delete input.objectId;
  } else {
    objectId = (0, _execute.parseID)(input.id).objectId;
    delete input.id;
  }

  return objectId;
}

function loadClass(className, schema) {
  const c = (0, _typesCache.getOrElse)(className, () => new ParseClass(className, schema));
  const objectType = c.graphQLObjectType();
  const inputType = c.graphQLInputObjectType();
  const updateType = c.graphQLUpdateInputObjectType();
  const queryType = c.graphQLQueryInputObjectType();
  const queryResultType = c.graphQLQueryResultType(objectType);
  const mutationResultType = c.graphQLMutationResultType(objectType);
  const subscriptionType = c.graphQLSubscriptionType();
  const get = {
    type: objectType,
    description: `Use this endpoint to get or query ${className} objects`,
    args: {
      objectId: {
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
      }
    },
    resolve: async (root, args, context, info) => {
      // Get the selections
      return await (0, _execute.runGet)(context, info, className, args.objectId, schema);
    }
  };
  const find = {
    type: queryResultType,
    description: `Use this endpoint to get or query ${className} objects`,
    args: {
      where: {
        type: queryType
      },
      first: {
        type: _graphql.GraphQLInt
      },
      last: {
        type: _graphql.GraphQLInt
      },
      after: {
        type: _graphql.GraphQLString
      },
      before: {
        type: _graphql.GraphQLString
      }
    },
    resolve: async (root, args, context, info) => {
      // Get the selections
      const results = await (0, _execute.runFind)(context, info, className, args, schema);
      return (0, _execute.connectionResultsArray)(results, args, 100);
    }
  };
  const create = {
    type: mutationResultType,
    fields: objectType.fields,
    description: `use this method to create a new ${className}`,
    args: {
      input: {
        type: inputType
      }
    },
    resolve: async (root, args, context, info) => {
      let {
        auth
      } = context;
      const {
        config
      } = context;
      const input = transformInput(args.input, schema[className]);
      const clientMutationId = input.clientMutationId;
      delete input.clientMutationId;
      await (0, _execute.handleFileUpload)(config, auth, className, input, schema);
      const res = await _execute.rest.create(config, auth, className, input);

      if (className === '_User' && res.response && res.response.sessionToken) {
        auth = await (0, _Auth.getAuthForSessionToken)({
          config,
          installationId: context.info && context.info.installationId,
          sessionToken: res.response.sessionToken
        });
      } // Run get to match graphQL style


      const object = await (0, _execute.runGet)({
        auth,
        config
      }, info, className, res.response.objectId);
      return {
        object,
        clientMutationId
      };
    }
  };
  const update = {
    type: mutationResultType,
    description: `use this method to update an existing ${className}`,
    args: {
      input: {
        type: updateType
      }
    },
    resolve: async (root, args, context, info) => {
      const objectId = getObjectId(args.input);
      const input = transformInput(args.input, schema[className]);
      const clientMutationId = input.clientMutationId;
      delete input.clientMutationId;
      await (0, _execute.handleFileUpload)(context.config, context.auth, className, input, schema);
      await _execute.rest.update(context.config, context.auth, className, {
        objectId
      }, input); // Run get to match graphQL style

      const object = await (0, _execute.runGet)(context, info, className, objectId);
      return {
        object,
        clientMutationId
      };
    }
  };
  const destroy = {
    type: mutationResultType,
    description: `use this method to update delete an existing ${className}`,
    args: {
      input: {
        type: new _graphql.GraphQLInputObjectType({
          name: `Destroy${c.displayName}Input`,
          fields: {
            id: {
              type: _graphql.GraphQLID,
              description: 'Use either the global id or objectId'
            },
            objectId: {
              type: _graphql.GraphQLID,
              description: 'Use either the global id or objectId'
            },
            clientMutationId: {
              type: _graphql.GraphQLString
            }
          }
        })
      }
    },
    resolve: async (root, args, context, info) => {
      const objectId = getObjectId(args.input);
      const clientMutationId = args.input.clientMutationId;
      const object = await (0, _execute.runGet)(context, info, className, objectId);
      await _execute.rest.del(context.config, context.auth, className, objectId);
      return {
        object,
        clientMutationId
      };
    }
  };
  const subscribe = {
    type: subscriptionType,
    description: `use this method to subscribe to an existing ${className}`,
    args: {
      events: {
        type: new _graphql.GraphQLList(eventType)
      },
      where: {
        type: queryType
      }
    },
    resolve: async (root, args, context, info) => {//TODO : Make connection to the ParseServerLiveQuery
    }
  };
  return {
    displayName: c.displayName,
    get,
    find,
    create,
    update,
    destroy,
    objectType,
    inputType,
    updateType,
    queryType,
    queryResultType,
    mutationResultType,
    parseClass: c
  };
}

const reservedFieldNames = ['objectId', 'createdAt', 'updatedAt'];

class ParseClass {
  constructor(className, schema) {
    this.className = className;
    this.displayName = className;

    if (this.className.indexOf('_') === 0) {
      this.displayName = this.className.slice(1);
    }

    this.schema = schema;
    this.class = this.schema[className];

    if (!this.class) {
      /* eslint-disable no-console */
      console.warn(`Attempting to load a class (${this.className}) that doesn't exist...`);
      console.trace();
      /* eslint-enable no-console */
    }
  }

  buildFields(mapper, filterReserved = false, isObject = false) {
    if (!this.class) {
      /* eslint-disable no-console */
      console.warn(`Attempting to build fields a class (${this.className}) that doesn't exist...`);
      console.trace();
      /* eslint-enable no-console */

      return;
    }

    const fields = this.class.fields;
    const initial = {};

    if (isObject) {
      initial.id = {
        description: 'A globaly unique identifier.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
      };
    }

    if (this.className === '_User') {
      initial.sessionToken = {
        description: 'The session token for the user, set only when it makes sense.',
        type: _graphql.GraphQLString
      };
    }

    return Object.keys(fields).reduce((memo, fieldName) => {
      if (filterReserved && reservedFieldNames.indexOf(fieldName) >= 0) {
        return memo;
      }

      const field = fields[fieldName];
      const gQLField = mapper(fieldName, field, this.schema);

      if (!gQLField) {
        return memo;
      }

      memo[fieldName] = gQLField;
      return memo;
    }, initial);
  }

  isTypeOf(object) {
    return object.className === this.className;
  }

  graphQLConfig() {
    const className = this.className;
    return {
      name: this.displayName,
      description: `Parse Class ${className}`,
      // in relay, it's impossible to have 2 interfaces???
      interfaces: [_Node.Node
      /* ParseObjectInterface */
      ],
      fields: () => this.buildFields(graphQLField, false, true),
      isTypeOf: this.isTypeOf.bind(this)
    };
  }

  graphQLQueryConfig() {
    const className = this.className;
    return {
      name: this.displayName + 'Query',
      description: `Parse Class ${className} Query`,
      fields: () => {
        const fields = this.buildFields(graphQLQueryField);
        delete fields.objectId;
        delete fields.id;
        return fields;
      },
      isTypeOf: this.isTypeOf.bind(this)
    };
  }

  graphQLInputConfig() {
    const className = this.className;
    return {
      name: `Add${this.displayName}Input`,
      description: `Parse Class ${className} Input`,
      fields: () => {
        const fields = this.buildFields(graphQLInputField, true);
        fields.clientMutationId = {
          type: _graphql.GraphQLString
        };
        return fields;
      },
      isTypeOf: this.isTypeOf.bind(this)
    };
  }

  graphQLUpdateInputConfig() {
    return {
      name: `Update${this.displayName}Input`,
      description: `Parse Class ${this.className} Update`,
      fields: () => {
        const fields = this.buildFields(graphQLInputField, true);
        fields.id = {
          type: _graphql.GraphQLID
        };
        fields.objectId = {
          type: _graphql.GraphQLID
        };
        fields.clientMutationId = {
          type: _graphql.GraphQLString
        };
        return fields;
      },
      isTypeOf: this.isTypeOf.bind(this)
    };
  }

  graphQLQueryResultConfig() {
    const objectType = this.graphQLObjectType();
    return {
      name: `${this.displayName}QueryConnection`,
      fields: {
        nodes: {
          type: new _graphql.GraphQLList(objectType)
        },
        edges: {
          type: new _graphql.GraphQLList(new _graphql.GraphQLObjectType({
            name: `${this.displayName}Edge`,
            fields: () => ({
              node: {
                type: objectType
              },
              cursor: {
                type: _graphql.GraphQLString
              }
            })
          }))
        },
        pageInfo: {
          type: _types.PageInfo
        }
      }
    };
  }

  graphQLMutationResultConfig() {
    const objectType = this.graphQLObjectType();
    return {
      name: `${this.displayName}MutationCompletePayload`,
      fields: {
        object: {
          type: objectType
        },
        clientMutationId: {
          type: _graphql.GraphQLString
        }
      }
    };
  }

  graphQLSubscriptionConfig() {
    const className = this.className;
    return {
      name: this.displayName + 'Subscription',
      description: `Parse Class ${className} Subscription`,
      fields: () => {
        const objectFields = this.buildFields(graphQLQueryField);
        delete objectFields.objectId;
        delete objectFields.id;
        return {
          event: {
            type: _types.Event
          },
          object: objectFields
        };
      },
      isTypeOf: this.isTypeOf.bind(this)
    };
  }

  graphQLObjectType() {
    if (!this.objectType) {
      this.objectType = new _graphql.GraphQLObjectType(this.graphQLConfig());
    }

    return this.objectType;
  }

  graphQLUpdateInputObjectType() {
    if (!this.updateInputObjectType) {
      this.updateInputObjectType = new _graphql.GraphQLInputObjectType(this.graphQLUpdateInputConfig());
    }

    return this.updateInputObjectType;
  }

  graphQLInputObjectType() {
    if (!this.inputObjectType) {
      this.inputObjectType = new _graphql.GraphQLInputObjectType(this.graphQLInputConfig());
    }

    return this.inputObjectType;
  }

  graphQLQueryInputObjectType() {
    if (!this.queryInputObjectType) {
      this.queryInputObjectType = new _graphql.GraphQLInputObjectType(this.graphQLQueryConfig());
    }

    return this.queryInputObjectType;
  }

  graphQLQueryResultType() {
    if (!this.queryResultObjectType) {
      this.queryResultObjectType = new _graphql.GraphQLObjectType(this.graphQLQueryResultConfig());
    }

    return this.queryResultObjectType;
  }

  graphQLMutationResultType() {
    if (!this.mutationResultObjectType) {
      this.mutationResultObjectType = new _graphql.GraphQLObjectType(this.graphQLMutationResultConfig());
    }

    return this.mutationResultObjectType;
  }

  graphQLSubscriptionType() {
    if (!this.subscriptionType) {
      this.subscriptionType = new _graphql.GraphQLObjectType(this.graphQLSubscriptionConfig());
    }

    return this.subscriptionType;
  }

}

exports.ParseClass = ParseClass;

function getParseClassQueryFields(schema) {
  return schema.__classNames.reduce((fields, className) => {
    const {
      get,
      find,
      displayName
    } = loadClass(className, schema);
    return Object.assign(fields, {
      [displayName]: get,
      [`find${displayName}`]: find
    });
  }, {});
}

function getParseClassMutationFields(schema) {
  return schema.__classNames.reduce((fields, className) => {
    const {
      create,
      update,
      destroy,
      displayName
    } = loadClass(className, schema);
    return Object.assign(fields, {
      [`add${displayName}`]: create,
      [`update${displayName}`]: update,
      [`destroy${displayName}`]: destroy
    });
  }, {});
}

function getParseClassSubscriptionField(schema) {
  return schema.__classNames.reduce((fields, className) => {
    const {
      subscribe,
      displayName
    } = loadClass(className, schema);
    return Object.assign(fields, {
      [`subscribe${displayName}`]: subscribe
    });
  }, {});
}

var _default = {
  Query: getParseClassQueryFields,
  Mutation: getParseClassMutationFields,
  Subscription: getParseClassSubscriptionField
};
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3NjaGVtYXMvUGFyc2VDbGFzcy5qcyJdLCJuYW1lcyI6WyJoYW5kbGVJZEZpZWxkIiwiZmllbGROYW1lIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMSUQiLCJnZXRSZWxhdGlvbkZpZWxkIiwiZmllbGQiLCJzY2hlbWEiLCJmaW5kIiwibG9hZENsYXNzIiwidGFyZ2V0Q2xhc3MiLCJyZXNvbHZlIiwicGFyZW50IiwiYXJncyIsImNvbnRleHQiLCJpbmZvIiwicXVlcnkiLCIkcmVsYXRlZFRvIiwib2JqZWN0IiwiX190eXBlIiwiY2xhc3NOYW1lIiwib2JqZWN0SWQiLCJrZXkiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInJlc3VsdHMiLCJmb3JFYWNoIiwicmVzdWx0IiwiaWQiLCJnZXRGaWVsZFR5cGUiLCJ0eXBlIiwiZ3JhcGhRTEZpZWxkIiwiZ1FMVHlwZSIsImZpZWxkVHlwZSIsImdRTFJlc29sdmUiLCJvYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiZ3JhcGhRTElucHV0RmllbGQiLCJncmFwaFFMUXVlcnlGaWVsZCIsInF1ZXJ5VHlwZSIsInRyYW5zZm9ybUlucHV0IiwiaW5wdXQiLCJmaWVsZHMiLCJPYmplY3QiLCJrZXlzIiwidmFsdWUiLCJnZXRPYmplY3RJZCIsImMiLCJQYXJzZUNsYXNzIiwiZ3JhcGhRTE9iamVjdFR5cGUiLCJpbnB1dFR5cGUiLCJncmFwaFFMSW5wdXRPYmplY3RUeXBlIiwidXBkYXRlVHlwZSIsImdyYXBoUUxVcGRhdGVJbnB1dE9iamVjdFR5cGUiLCJncmFwaFFMUXVlcnlJbnB1dE9iamVjdFR5cGUiLCJxdWVyeVJlc3VsdFR5cGUiLCJncmFwaFFMUXVlcnlSZXN1bHRUeXBlIiwibXV0YXRpb25SZXN1bHRUeXBlIiwiZ3JhcGhRTE11dGF0aW9uUmVzdWx0VHlwZSIsInN1YnNjcmlwdGlvblR5cGUiLCJncmFwaFFMU3Vic2NyaXB0aW9uVHlwZSIsImdldCIsInJvb3QiLCJ3aGVyZSIsImZpcnN0IiwiR3JhcGhRTEludCIsImxhc3QiLCJhZnRlciIsIkdyYXBoUUxTdHJpbmciLCJiZWZvcmUiLCJjcmVhdGUiLCJhdXRoIiwiY29uZmlnIiwiY2xpZW50TXV0YXRpb25JZCIsInJlcyIsInJlc3QiLCJyZXNwb25zZSIsInNlc3Npb25Ub2tlbiIsImluc3RhbGxhdGlvbklkIiwidXBkYXRlIiwiZGVzdHJveSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJkaXNwbGF5TmFtZSIsImRlbCIsInN1YnNjcmliZSIsImV2ZW50cyIsIkdyYXBoUUxMaXN0IiwiZXZlbnRUeXBlIiwicGFyc2VDbGFzcyIsInJlc2VydmVkRmllbGROYW1lcyIsImNvbnN0cnVjdG9yIiwiaW5kZXhPZiIsInNsaWNlIiwiY2xhc3MiLCJjb25zb2xlIiwid2FybiIsInRyYWNlIiwiYnVpbGRGaWVsZHMiLCJtYXBwZXIiLCJmaWx0ZXJSZXNlcnZlZCIsImlzT2JqZWN0IiwiaW5pdGlhbCIsInJlZHVjZSIsIm1lbW8iLCJnUUxGaWVsZCIsImlzVHlwZU9mIiwiZ3JhcGhRTENvbmZpZyIsImludGVyZmFjZXMiLCJOb2RlIiwiYmluZCIsImdyYXBoUUxRdWVyeUNvbmZpZyIsImdyYXBoUUxJbnB1dENvbmZpZyIsImdyYXBoUUxVcGRhdGVJbnB1dENvbmZpZyIsImdyYXBoUUxRdWVyeVJlc3VsdENvbmZpZyIsIm5vZGVzIiwiZWRnZXMiLCJHcmFwaFFMT2JqZWN0VHlwZSIsIm5vZGUiLCJjdXJzb3IiLCJwYWdlSW5mbyIsIlBhZ2VJbmZvIiwiZ3JhcGhRTE11dGF0aW9uUmVzdWx0Q29uZmlnIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbkNvbmZpZyIsIm9iamVjdEZpZWxkcyIsImV2ZW50IiwiRXZlbnQiLCJ1cGRhdGVJbnB1dE9iamVjdFR5cGUiLCJpbnB1dE9iamVjdFR5cGUiLCJxdWVyeUlucHV0T2JqZWN0VHlwZSIsInF1ZXJ5UmVzdWx0T2JqZWN0VHlwZSIsIm11dGF0aW9uUmVzdWx0T2JqZWN0VHlwZSIsImdldFBhcnNlQ2xhc3NRdWVyeUZpZWxkcyIsIl9fY2xhc3NOYW1lcyIsImFzc2lnbiIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkZpZWxkcyIsImdldFBhcnNlQ2xhc3NTdWJzY3JpcHRpb25GaWVsZCIsIlF1ZXJ5IiwiTXV0YXRpb24iLCJTdWJzY3JpcHRpb24iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUE7O0FBVUE7O0FBRUE7O0FBVUE7O0FBRUE7O0FBRUE7O0FBQ0E7O0FBRUEsU0FBU0EsYUFBVCxDQUF1QkMsU0FBdkIsRUFBa0M7QUFDaEMsTUFBSUEsU0FBUyxLQUFLLFVBQWQsSUFBNEJBLFNBQVMsSUFBSSxJQUE3QyxFQUFtRDtBQUNqRCxXQUFPLElBQUlDLHVCQUFKLENBQW1CQyxrQkFBbkIsQ0FBUDtBQUNEO0FBQ0Y7O0FBRUQsU0FBU0MsZ0JBQVQsQ0FBMEJILFNBQTFCLEVBQXFDSSxLQUFyQyxFQUE0Q0MsTUFBNUMsRUFBb0Q7QUFDbEQsUUFBTTtBQUFFQyxJQUFBQTtBQUFGLE1BQVdDLFNBQVMsQ0FBQ0gsS0FBSyxDQUFDSSxXQUFQLEVBQW9CSCxNQUFwQixDQUExQjs7QUFDQUMsRUFBQUEsSUFBSSxDQUFDRyxPQUFMLEdBQWUsT0FBT0MsTUFBUCxFQUFlQyxJQUFmLEVBQXFCQyxPQUFyQixFQUE4QkMsSUFBOUIsS0FBdUM7QUFDcEQsVUFBTUMsS0FBSyxHQUFHO0FBQ1pDLE1BQUFBLFVBQVUsRUFBRTtBQUNWQyxRQUFBQSxNQUFNLEVBQUU7QUFDTkMsVUFBQUEsTUFBTSxFQUFFLFNBREY7QUFFTkMsVUFBQUEsU0FBUyxFQUFFUixNQUFNLENBQUNRLFNBRlo7QUFHTkMsVUFBQUEsUUFBUSxFQUFFVCxNQUFNLENBQUNTO0FBSFgsU0FERTtBQU1WQyxRQUFBQSxHQUFHLEVBQUVwQjtBQU5LO0FBREEsS0FBZDtBQVVBVyxJQUFBQSxJQUFJLENBQUNVLHVCQUFMLEdBQStCckIsU0FBL0I7QUFDQSxVQUFNc0IsT0FBTyxHQUFHLE1BQU0sc0JBQ3BCVixPQURvQixFQUVwQkMsSUFGb0Is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V0FBWSxFQUF6QixHQUE2QkU7QUFBOUIsS0FBckIsQ0FBUDtBQUNELEdBTk0sRUFNSixFQU5JLENBQVA7QUFPRDs7ZUFFYztBQUNib0QsRUFBQUEsS0FBSyxFQUFFTCx3QkFETTtBQUViTSxFQUFBQSxRQUFRLEVBQUVILDJCQUZHO0FBR2JJLEVBQUFBLFlBQVksRUFBRUg7QUFIRCxDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgcnVuRmluZCxcbiAgcnVuR2V0LFxuICByZXNvbHZlUG9pbnRlcixcbiAgcmVzdCxcbiAgY29ubmVjdGlvblJlc3VsdHNBcnJheSxcbiAgcGFyc2VJRCxcbiAgZ2V0R2xvYmFsbHlVbmlxdWVJZCxcbiAgaGFuZGxlRmlsZVVwbG9hZCxcbn0gZnJvbSAnLi4vZXhlY3V0ZSc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuIH0gZnJvbSAnLi4vLi4vQXV0aCc7XG5cbmltcG9ydCB7XG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTEludCxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTElELFxuICBHcmFwaFFMTm9uTnVsbCxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5cbmltcG9ydCB7IHF1ZXJ5VHlwZSwgaW5wdXRUeXBlLCB0eXBlLCBQYWdlSW5mbywgRXZlbnQgfSBmcm9tICcuLi90eXBlcyc7XG5cbmltcG9ydCB7IE5vZGUgfSBmcm9tICcuLi90eXBlcy9Ob2RlJztcblxuaW1wb3J0IHsgZ2V0T3JFbHNlIH0gZnJvbSAnLi4vdHlwZXNDYWNoZSc7XG5pbXBvcnQgeyB0b1BhcnNlQUNMIH0gZnJvbSAnLi4vdHlwZXMvQUNMJztcblxuZnVuY3Rpb24gaGFuZGxlSWRGaWVsZChmaWVsZE5hbWUpIHtcbiAgaWYgKGZpZWxkTmFtZSA9PT0gJ29iamVjdElkJyB8fCBmaWVsZE5hbWUgPT0gJ2lkJykge1xuICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRSZWxhdGlvbkZpZWxkKGZpZWxkTmFtZSwgZmllbGQsIHNjaGVtYSkge1xuICBjb25zdCB7IGZpbmQgfSA9IGxvYWRDbGFzcyhmaWVsZC50YXJnZXRDbGFzcywgc2NoZW1hKTtcbiAgZmluZC5yZXNvbHZlID0gYXN5bmMgKHBhcmVudCwgYXJncywgY29udGV4dCwgaW5mbykgPT4ge1xuICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgJHJlbGF0ZWRUbzoge1xuICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHBhcmVudC5jbGFzc05hbWUsXG4gICAgICAgICAgb2JqZWN0SWQ6IHBhcmVudC5vYmplY3RJZCxcbiAgICAgICAgfSxcbiAgICAgICAga2V5OiBmaWVsZE5hbWUsXG4gICAgICB9LFxuICAgIH07XG4gICAgYXJncy5yZWRpcmVjdENsYXNzTmFtZUZvcktleSA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgcnVuRmluZChcbiAgICAgIGNvbnRleHQsXG4gICAgICBpbmZvLFxuICAgICAgcGFyZW50LmNsYXNzTmFtZSxcbiAgICAgIGFyZ3MsXG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeVxuICAgICk7XG4gICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICByZXN1bHQuaWQgPSBnZXRHbG9iYWxseVVuaXF1ZUlkKHJlc3VsdC5jbGFzc05hbWUsIHJlc3VsdC5vYmplY3RJZCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGNvbm5lY3Rpb25SZXN1bHRzQXJyYXkocmVzdWx0cywgYXJncywgMTAwKTtcbiAgfTtcbiAgcmV0dXJuIGZpbmQ7XG59XG5cbmZ1bmN0aW9uIGdldEZpZWxkVHlwZShmaWVsZCkge1xuICByZXR1cm4gZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInXG4gICAgPyBgUG9pbnRlcjwke2ZpZWxkLnRhcmdldENsYXNzfT5gXG4gICAgOiBgJHtmaWVsZC50eXBlfWA7XG59XG5cbmZ1bmN0aW9uIGdyYXBoUUxGaWVsZChmaWVsZE5hbWUsIGZpZWxkLCBzY2hlbWEpIHtcbiAgaWYgKGZpZWxkLnR5cGUgPT0gJ1JlbGF0aW9uJykge1xuICAgIHJldHVybiBnZXRSZWxhdGlvbkZpZWxkKGZpZWxkTmFtZSwgZmllbGQsIHNjaGVtYSk7XG4gIH1cblxuICBsZXQgZ1FMVHlwZSA9IGhhbmRsZUlkRmllbGQoZmllbGROYW1lKSB8fCB0eXBlKGZpZWxkKTtcbiAgY29uc3QgZmllbGRUeXBlID0gZ2V0RmllbGRUeXBlKGZpZWxkKTtcbiAgbGV0IGdRTFJlc29sdmU7XG4gIGlmIChmaWVsZC50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICBnUUxUeXBlID0gbG9hZENsYXNzKGZpZWxkLnRhcmdldENsYXNzLCBzY2hlbWEpLm9iamVjdFR5cGU7XG4gICAgZ1FMUmVzb2x2ZSA9IChwYXJlbnQsIGFyZ3MsIGNvbnRleHQsIGluZm8pID0+IHtcbiAgICAgIHJldHVybiByZXNvbHZlUG9pbnRlcihcbiAgICAgICAgZmllbGQudGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcmVudFtmaWVsZE5hbWVdLFxuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGNvbnRleHQsXG4gICAgICAgIGluZm9cbiAgICAgICk7XG4gICAgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIG5hbWU6IGZpZWxkTmFtZSxcbiAgICB0eXBlOiBnUUxUeXBlLFxuICAgIHJlc29sdmU6IGdRTFJlc29sdmUsXG4gICAgZGVzY3JpcHRpb246IGBBY2Nlc3NvciBmb3IgJHtmaWVsZE5hbWV9ICgke2ZpZWxkVHlwZX0pYCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ3JhcGhRTElucHV0RmllbGQoZmllbGROYW1lLCBmaWVsZCkge1xuICBjb25zdCBnUUxUeXBlID0gaGFuZGxlSWRGaWVsZChmaWVsZE5hbWUpIHx8IGlucHV0VHlwZShmaWVsZCk7XG4gIGlmICghZ1FMVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBmaWVsZFR5cGUgPSBnZXRGaWVsZFR5cGUoZmllbGQpO1xuICByZXR1cm4ge1xuICAgIG5hbWU6IGZpZWxkTmFtZSxcbiAgICB0eXBlOiBnUUxUeXBlLFxuICAgIGRlc2NyaXB0aW9uOiBgU2V0dGVyIGZvciAke2ZpZWxkTmFtZX0gKCR7ZmllbGRUeXBlfSlgLFxuICB9O1xufVxuXG5mdW5jdGlvbiBncmFwaFFMUXVlcnlGaWVsZChmaWVsZE5hbWUsIGZpZWxkLCBzY2hlbWEpIHtcbiAgbGV0IGdRTFR5cGUgPSBoYW5kbGVJZEZpZWxkKGZpZWxkTmFtZSkgfHwgcXVlcnlUeXBlKGZpZWxkKTtcbiAgaWYgKCFnUUxUeXBlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChmaWVsZC50eXBlID09ICdQb2ludGVyJykge1xuICAgIGdRTFR5cGUgPSBsb2FkQ2xhc3MoZmllbGQudGFyZ2V0Q2xhc3MsIHNjaGVtYSkucXVlcnlUeXBlO1xuICB9XG4gIHJldHVybiB7XG4gICAgbmFtZTogZmllbGROYW1lLFxuICAgIHR5cGU6IGdRTFR5cGUsXG4gICAgZGVzY3JpcHRpb246IGBRdWVyeSBmb3IgJHtmaWVsZE5hbWV9ICgke2ZpZWxkLnR5cGV9KWAsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUlucHV0KGlucHV0LCBzY2hlbWEpIHtcbiAgY29uc3QgeyBmaWVsZHMgfSA9IHNjaGVtYTtcbiAgT2JqZWN0LmtleXMoaW5wdXQpLmZvckVhY2goa2V5ID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IGlucHV0W2tleV07XG4gICAgaWYgKGZpZWxkc1trZXldICYmIGZpZWxkc1trZXldLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgdmFsdWUuX190eXBlID0gJ1BvaW50ZXInO1xuICAgIH0gZWxzZSBpZiAoZmllbGRzW2tleV0gJiYgZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgdmFsdWUuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICB9IGVsc2UgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgIGlucHV0W2tleV0gPSB0b1BhcnNlQUNMKHZhbHVlKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gaW5wdXQ7XG59XG5cbmZ1bmN0aW9uIGdldE9iamVjdElkKGlucHV0KSB7XG4gIGlmICghaW5wdXQuaWQgJiYgIWlucHV0Lm9iamVjdElkKSB7XG4gICAgdGhyb3cgJ2lkIG9yIG9iamVjdElkIGFyZSByZXF1aXJlZCc7XG4gIH1cbiAgbGV0IG9iamVjdElkO1xuICBpZiAoaW5wdXQub2JqZWN0SWQpIHtcbiAgICBvYmplY3RJZCA9IGlucHV0Lm9iamVjdElkO1xuICAgIGRlbGV0ZSBpbnB1dC5vYmplY3RJZDtcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RJZCA9IHBhcnNlSUQoaW5wdXQuaWQpLm9iamVjdElkO1xuICAgIGRlbGV0ZSBpbnB1dC5pZDtcbiAgfVxuICByZXR1cm4gb2JqZWN0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkQ2xhc3MoY2xhc3NOYW1lLCBzY2hlbWEpIHtcbiAgY29uc3QgYyA9IGdldE9yRWxzZShjbGFzc05hbWUsICgpID0+IG5ldyBQYXJzZUNsYXNzKGNsYXNzTmFtZSwgc2NoZW1hKSk7XG4gIGNvbnN0IG9iamVjdFR5cGUgPSBjLmdyYXBoUUxPYmplY3RUeXBlKCk7XG4gIGNvbnN0IGlucHV0VHlwZSA9IGMuZ3JhcGhRTElucHV0T2JqZWN0VHlwZSgpO1xuICBjb25zdCB1cGRhdGVUeXBlID0gYy5ncmFwaFFMVXBkYXRlSW5wdXRPYmplY3RUeXBlKCk7XG4gIGNvbnN0IHF1ZXJ5VHlwZSA9IGMuZ3JhcGhRTFF1ZXJ5SW5wdXRPYmplY3RUeXBlKCk7XG4gIGNvbnN0IHF1ZXJ5UmVzdWx0VHlwZSA9IGMuZ3JhcGhRTFF1ZXJ5UmVzdWx0VHlwZShvYmplY3RUeXBlKTtcbiAgY29uc3QgbXV0YXRpb25SZXN1bHRUeXBlID0gYy5ncmFwaFFMTXV0YXRpb25SZXN1bHRUeXBlKG9iamVjdFR5cGUpO1xuICBjb25zdCBzdWJzY3JpcHRpb25UeXBlID0gYy5ncmFwaFFMU3Vic2NyaXB0aW9uVHlwZSgpO1xuXG4gIGNvbnN0IGdldCA9IHtcbiAgICB0eXBlOiBvYmplY3RUeXBlLFxuICAgIGRlc2NyaXB0aW9uOiBgVXNlIHRoaXMgZW5kcG9pbnQgdG8gZ2V0IG9yIHF1ZXJ5ICR7Y2xhc3NOYW1lfSBvYmplY3RzYCxcbiAgICBhcmdzOiB7XG4gICAgICBvYmplY3RJZDogeyB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSB9LFxuICAgIH0sXG4gICAgcmVzb2x2ZTogYXN5bmMgKHJvb3QsIGFyZ3MsIGNvbnRleHQsIGluZm8pID0+IHtcbiAgICAgIC8vIEdldCB0aGUgc2VsZWN0aW9uc1xuICAgICAgcmV0dXJuIGF3YWl0IHJ1bkdldChjb250ZXh0LCBpbmZvLCBjbGFzc05hbWUsIGFyZ3Mub2JqZWN0SWQsIHNjaGVtYSk7XG4gICAgfSxcbiAgfTtcblxuICBjb25zdCBmaW5kID0ge1xuICAgIHR5cGU6IHF1ZXJ5UmVzdWx0VHlwZSxcbiAgICBkZXNjcmlwdGlvbjogYFVzZSB0aGlzIGVuZHBvaW50IHRvIGdldCBvciBxdWVyeSAke2NsYXNzTmFtZX0gb2JqZWN0c2AsXG4gICAgYXJnczoge1xuICAgICAgd2hlcmU6IHsgdHlwZTogcXVlcnlUeXBlIH0sXG4gICAgICBmaXJzdDogeyB0eXBlOiBHcmFwaFFMSW50IH0sXG4gICAgICBsYXN0OiB7IHR5cGU6IEdyYXBoUUxJbnQgfSxcbiAgICAgIGFmdGVyOiB7IHR5cGU6IEdyYXBoUUxTdHJpbmcgfSxcbiAgICAgIGJlZm9yZTogeyB0eXBlOiBHcmFwaFFMU3RyaW5nIH0sXG4gICAgfSxcbiAgICByZXNvbHZlOiBhc3luYyAocm9vdCwgYXJncywgY29udGV4dCwgaW5mbykgPT4ge1xuICAgICAgLy8gR2V0IHRoZSBzZWxlY3Rpb25zXG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgcnVuRmluZChjb250ZXh0LCBpbmZvLCBjbGFzc05hbWUsIGFyZ3MsIHNjaGVtYSk7XG4gICAgICByZXR1cm4gY29ubmVjdGlvblJlc3VsdHNBcnJheShyZXN1bHRzLCBhcmdzLCAxMDApO1xuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgY3JlYXRlID0ge1xuICAgIHR5cGU6IG11dGF0aW9uUmVzdWx0VHlwZSxcbiAgICBmaWVsZHM6IG9iamVjdFR5cGUuZmllbGRzLFxuICAgIGRlc2NyaXB0aW9uOiBgdXNlIHRoaXMgbWV0aG9kIHRvIGNyZWF0ZSBhIG5ldyAke2NsYXNzTmFtZX1gLFxuICAgIGFyZ3M6IHsgaW5wdXQ6IHsgdHlwZTogaW5wdXRUeXBlIH0gfSxcbiAgICByZXNvbHZlOiBhc3luYyAocm9vdCwgYXJncywgY29udGV4dCwgaW5mbykgPT4ge1xuICAgICAgbGV0IHsgYXV0aCB9ID0gY29udGV4dDtcbiAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSBjb250ZXh0O1xuICAgICAgY29uc3QgaW5wdXQgPSB0cmFuc2Zvcm1JbnB1dChhcmdzLmlucHV0LCBzY2hlbWFbY2xhc3NOYW1lXSk7XG4gICAgICBjb25zdCBjbGllbnRNdXRhdGlvbklkID0gaW5wdXQuY2xpZW50TXV0YXRpb25JZDtcbiAgICAgIGRlbGV0ZSBpbnB1dC5jbGllbnRNdXRhdGlvbklkO1xuICAgICAgYXdhaXQgaGFuZGxlRmlsZVVwbG9hZChjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgaW5wdXQsIHNjaGVtYSk7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCByZXN0LmNyZWF0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgaW5wdXQpO1xuICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiByZXMucmVzcG9uc2UgJiYgcmVzLnJlc3BvbnNlLnNlc3Npb25Ub2tlbikge1xuICAgICAgICBhdXRoID0gYXdhaXQgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjb250ZXh0LmluZm8gJiYgY29udGV4dC5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHNlc3Npb25Ub2tlbjogcmVzLnJlc3BvbnNlLnNlc3Npb25Ub2tlbixcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICAvLyBSdW4gZ2V0IHRvIG1hdGNoIGdyYXBoUUwgc3R5bGVcbiAgICAgIGNvbnN0IG9iamVjdCA9IGF3YWl0IHJ1bkdldChcbiAgICAgICAgeyBhdXRoLCBjb25maWcgfSxcbiAgICAgICAgaW5mbyxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICByZXMucmVzcG9uc2Uub2JqZWN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm4geyBvYmplY3QsIGNsaWVudE11dGF0aW9uSWQgfTtcbiAgICB9LFxuICB9O1xuXG4gIGNvbnN0IHVwZGF0ZSA9IHtcbiAgICB0eXBlOiBtdXRhdGlvblJlc3VsdFR5cGUsXG4gICAgZGVzY3JpcHRpb246IGB1c2UgdGhpcyBtZXRob2QgdG8gdXBkYXRlIGFuIGV4aXN0aW5nICR7Y2xhc3NOYW1lfWAsXG4gICAgYXJnczoge1xuICAgICAgaW5wdXQ6IHsgdHlwZTogdXBkYXRlVHlwZSB9LFxuICAgIH0sXG4gICAgcmVzb2x2ZTogYXN5bmMgKHJvb3QsIGFyZ3MsIGNvbnRleHQsIGluZm8pID0+IHtcbiAgICAgIGNvbnN0IG9iamVjdElkID0gZ2V0T2JqZWN0SWQoYXJncy5pbnB1dCk7XG4gICAgICBjb25zdCBpbnB1dCA9IHRyYW5zZm9ybUlucHV0KGFyZ3MuaW5wdXQsIHNjaGVtYVtjbGFzc05hbWVdKTtcbiAgICAgIGNvbnN0IGNsaWVudE11dGF0aW9uSWQgPSBpbnB1dC5jbGllbnRNdXRhdGlvbklkO1xuICAgICAgZGVsZXRlIGlucHV0LmNsaWVudE11dGF0aW9uSWQ7XG4gICAgICBhd2FpdCBoYW5kbGVGaWxlVXBsb2FkKFxuICAgICAgICBjb250ZXh0LmNvbmZpZyxcbiAgICAgICAgY29udGV4dC5hdXRoLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGlucHV0LFxuICAgICAgICBzY2hlbWFcbiAgICAgICk7XG5cbiAgICAgIGF3YWl0IHJlc3QudXBkYXRlKFxuICAgICAgICBjb250ZXh0LmNvbmZpZyxcbiAgICAgICAgY29udGV4dC5hdXRoLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHsgb2JqZWN0SWQgfSxcbiAgICAgICAgaW5wdXRcbiAgICAgICk7XG4gICAgICAvLyBSdW4gZ2V0IHRvIG1hdGNoIGdyYXBoUUwgc3R5bGVcbiAgICAgIGNvbnN0IG9iamVjdCA9IGF3YWl0IHJ1bkdldChjb250ZXh0LCBpbmZvLCBjbGFzc05hbWUsIG9iamVjdElkKTtcbiAgICAgIHJldHVybiB7IG9iamVjdCwgY2xpZW50TXV0YXRpb25JZCB9O1xuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgZGVzdHJveSA9IHtcbiAgICB0eXBlOiBtdXRhdGlvblJlc3VsdFR5cGUsXG4gICAgZGVzY3JpcHRpb246IGB1c2UgdGhpcyBtZXRob2QgdG8gdXBkYXRlIGRlbGV0ZSBhbiBleGlzdGluZyAke2NsYXNzTmFtZX1gLFxuICAgIGFyZ3M6IHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICAgICAgICBuYW1lOiBgRGVzdHJveSR7Yy5kaXNwbGF5TmFtZX1JbnB1dGAsXG4gICAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgICBpZDoge1xuICAgICAgICAgICAgICB0eXBlOiBHcmFwaFFMSUQsXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVXNlIGVpdGhlciB0aGUgZ2xvYmFsIGlkIG9yIG9iamVjdElkJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvYmplY3RJZDoge1xuICAgICAgICAgICAgICB0eXBlOiBHcmFwaFFMSUQsXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVXNlIGVpdGhlciB0aGUgZ2xvYmFsIGlkIG9yIG9iamVjdElkJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjbGllbnRNdXRhdGlvbklkOiB7IHR5cGU6IEdyYXBoUUxTdHJpbmcgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICByZXNvbHZlOiBhc3luYyAocm9vdCwgYXJncywgY29udGV4dCwgaW5mbykgPT4ge1xuICAgICAgY29uc3Qgb2JqZWN0SWQgPSBnZXRPYmplY3RJZChhcmdzLmlucHV0KTtcbiAgICAgIGNvbnN0IGNsaWVudE11dGF0aW9uSWQgPSBhcmdzLmlucHV0LmNsaWVudE11dGF0aW9uSWQ7XG4gICAgICBjb25zdCBvYmplY3QgPSBhd2FpdCBydW5HZXQoY29udGV4dCwgaW5mbywgY2xhc3NOYW1lLCBvYmplY3RJZCk7XG4gICAgICBhd2FpdCByZXN0LmRlbChjb250ZXh0LmNvbmZpZywgY29udGV4dC5hdXRoLCBjbGFzc05hbWUsIG9iamVjdElkKTtcbiAgICAgIHJldHVybiB7IG9iamVjdCwgY2xpZW50TXV0YXRpb25JZCB9O1xuICAgIH0sXG4gIH07XG5cbiAgY29uc3Qgc3Vic2NyaWJlID0ge1xuICAgIHR5cGU6IHN1YnNjcmlwdGlvblR5cGUsXG4gICAgZGVzY3JpcHRpb246IGB1c2UgdGhpcyBtZXRob2QgdG8gc3Vic2NyaWJlIHRvIGFuIGV4aXN0aW5nICR7Y2xhc3NOYW1lfWAsXG4gICAgYXJnczoge1xuICAgICAgZXZlbnRzIDoge3R5cGUgOiBuZXcgR3JhcGhRTExpc3QoZXZlbnRUeXBlKX0sXG4gICAgICB3aGVyZTogeyB0eXBlOiBxdWVyeVR5cGUgfSxcbiAgICB9LFxuICAgIHJlc29sdmU6IGFzeW5jIChyb290LCBhcmdzLCBjb250ZXh0LCBpbmZvKSA9PiB7XG4gICAgICAvL1RPRE8gOiBNYWtlIGNvbm5lY3Rpb24gdG8gdGhlIFBhcnNlU2VydmVyTGl2ZVF1ZXJ5XG4gICAgfSxcbiAgfTtcblxuICByZXR1cm4ge1xuICAgIGRpc3BsYXlOYW1lOiBjLmRpc3BsYXlOYW1lLFxuICAgIGdldCxcbiAgICBmaW5kLFxuICAgIGNyZWF0ZSxcbiAgICB1cGRhdGUsXG4gICAgZGVzdHJveSxcbiAgICBvYmplY3RUeXBlLFxuICAgIGlucHV0VHlwZSxcbiAgICB1cGRhdGVUeXBlLFxuICAgIHF1ZXJ5VHlwZSxcbiAgICBxdWVyeVJlc3VsdFR5cGUsXG4gICAgbXV0YXRpb25SZXN1bHRUeXBlLFxuICAgIHBhcnNlQ2xhc3M6IGMsXG4gIH07XG59XG5cbmNvbnN0IHJlc2VydmVkRmllbGROYW1lcyA9IFsnb2JqZWN0SWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCddO1xuXG5leHBvcnQgY2xhc3MgUGFyc2VDbGFzcyB7XG4gIHNjaGVtYTtcbiAgY2xhc3NOYW1lO1xuICBjbGFzcztcblxuICBjb25zdHJ1Y3RvcihjbGFzc05hbWUsIHNjaGVtYSkge1xuICAgIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIHRoaXMuZGlzcGxheU5hbWUgPSBjbGFzc05hbWU7XG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lLmluZGV4T2YoJ18nKSA9PT0gMCkge1xuICAgICAgdGhpcy5kaXNwbGF5TmFtZSA9IHRoaXMuY2xhc3NOYW1lLnNsaWNlKDEpO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYSA9IHNjaGVtYTtcbiAgICB0aGlzLmNsYXNzID0gdGhpcy5zY2hlbWFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIXRoaXMuY2xhc3MpIHtcbiAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYEF0dGVtcHRpbmcgdG8gbG9hZCBhIGNsYXNzICgke3RoaXMuY2xhc3NOYW1lfSkgdGhhdCBkb2Vzbid0IGV4aXN0Li4uYFxuICAgICAgKTtcbiAgICAgIGNvbnNvbGUudHJhY2UoKTtcbiAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgIH1cbiAgfVxuXG4gIGJ1aWxkRmllbGRzKG1hcHBlciwgZmlsdGVyUmVzZXJ2ZWQgPSBmYWxzZSwgaXNPYmplY3QgPSBmYWxzZSkge1xuICAgIGlmICghdGhpcy5jbGFzcykge1xuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgQXR0ZW1wdGluZyB0byBidWlsZCBmaWVsZHMgYSBjbGFzcyAoJHtcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZVxuICAgICAgICB9KSB0aGF0IGRvZXNuJ3QgZXhpc3QuLi5gXG4gICAgICApO1xuICAgICAgY29uc29sZS50cmFjZSgpO1xuICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IHRoaXMuY2xhc3MuZmllbGRzO1xuICAgIGNvbnN0IGluaXRpYWwgPSB7fTtcbiAgICBpZiAoaXNPYmplY3QpIHtcbiAgICAgIGluaXRpYWwuaWQgPSB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQSBnbG9iYWx5IHVuaXF1ZSBpZGVudGlmaWVyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICBpbml0aWFsLnNlc3Npb25Ub2tlbiA9IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoZSBzZXNzaW9uIHRva2VuIGZvciB0aGUgdXNlciwgc2V0IG9ubHkgd2hlbiBpdCBtYWtlcyBzZW5zZS4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKGZpZWxkcykucmVkdWNlKChtZW1vLCBmaWVsZE5hbWUpID0+IHtcbiAgICAgIGlmIChmaWx0ZXJSZXNlcnZlZCAmJiByZXNlcnZlZEZpZWxkTmFtZXMuaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9XG4gICAgICBjb25zdCBmaWVsZCA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgY29uc3QgZ1FMRmllbGQgPSBtYXBwZXIoZmllbGROYW1lLCBmaWVsZCwgdGhpcy5zY2hlbWEpO1xuICAgICAgaWYgKCFnUUxGaWVsZCkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIG1lbW9bZmllbGROYW1lXSA9IGdRTEZpZWxkO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgaW5pdGlhbCk7XG4gIH1cblxuICBpc1R5cGVPZihvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0LmNsYXNzTmFtZSA9PT0gdGhpcy5jbGFzc05hbWU7XG4gIH1cblxuICBncmFwaFFMQ29uZmlnKCkge1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHRoaXMuY2xhc3NOYW1lO1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiB0aGlzLmRpc3BsYXlOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IGBQYXJzZSBDbGFzcyAke2NsYXNzTmFtZX1gLFxuICAgICAgLy8gaW4gcmVsYXksIGl0J3MgaW1wb3NzaWJsZSB0byBoYXZlIDIgaW50ZXJmYWNlcz8/P1xuICAgICAgaW50ZXJmYWNlczogW05vZGUgLyogUGFyc2VPYmplY3RJbnRlcmZhY2UgKi9dLFxuICAgICAgZmllbGRzOiAoKSA9PiB0aGlzLmJ1aWxkRmllbGRzKGdyYXBoUUxGaWVsZCwgZmFsc2UsIHRydWUpLFxuICAgICAgaXNUeXBlT2Y6IHRoaXMuaXNUeXBlT2YuYmluZCh0aGlzKSxcbiAgICB9O1xuICB9XG5cbiAgZ3JhcGhRTFF1ZXJ5Q29uZmlnKCkge1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHRoaXMuY2xhc3NOYW1lO1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiB0aGlzLmRpc3BsYXlOYW1lICsgJ1F1ZXJ5JyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUGFyc2UgQ2xhc3MgJHtjbGFzc05hbWV9IFF1ZXJ5YCxcbiAgICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZHMgPSB0aGlzLmJ1aWxkRmllbGRzKGdyYXBoUUxRdWVyeUZpZWxkKTtcbiAgICAgICAgZGVsZXRlIGZpZWxkcy5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIGZpZWxkcy5pZDtcbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH0sXG4gICAgICBpc1R5cGVPZjogdGhpcy5pc1R5cGVPZi5iaW5kKHRoaXMpLFxuICAgIH07XG4gIH1cblxuICBncmFwaFFMSW5wdXRDb25maWcoKSB7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gdGhpcy5jbGFzc05hbWU7XG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IGBBZGQke3RoaXMuZGlzcGxheU5hbWV9SW5wdXRgLFxuICAgICAgZGVzY3JpcHRpb246IGBQYXJzZSBDbGFzcyAke2NsYXNzTmFtZX0gSW5wdXRgLFxuICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkcyA9IHRoaXMuYnVpbGRGaWVsZHMoZ3JhcGhRTElucHV0RmllbGQsIHRydWUpO1xuICAgICAgICBmaWVsZHMuY2xpZW50TXV0YXRpb25JZCA9IHsgdHlwZTogR3JhcGhRTFN0cmluZyB9O1xuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfSxcbiAgICAgIGlzVHlwZU9mOiB0aGlzLmlzVHlwZU9mLmJpbmQodGhpcyksXG4gICAgfTtcbiAgfVxuXG4gIGdyYXBoUUxVcGRhdGVJbnB1dENvbmZpZygpIHtcbiAgICByZXR1cm4ge1xuICAgICAgbmFtZTogYFVwZGF0ZSR7dGhpcy5kaXNwbGF5TmFtZX1JbnB1dGAsXG4gICAgICBkZXNjcmlwdGlvbjogYFBhcnNlIENsYXNzICR7dGhpcy5jbGFzc05hbWV9IFVwZGF0ZWAsXG4gICAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgICAgY29uc3QgZmllbGRzID0gdGhpcy5idWlsZEZpZWxkcyhncmFwaFFMSW5wdXRGaWVsZCwgdHJ1ZSk7XG4gICAgICAgIGZpZWxkcy5pZCA9IHsgdHlwZTogR3JhcGhRTElEIH07XG4gICAgICAgIGZpZWxkcy5vYmplY3RJZCA9IHsgdHlwZTogR3JhcGhRTElEIH07XG4gICAgICAgIGZpZWxkcy5jbGllbnRNdXRhdGlvbklkID0geyB0eXBlOiBHcmFwaFFMU3RyaW5nIH07XG4gICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICB9LFxuICAgICAgaXNUeXBlT2Y6IHRoaXMuaXNUeXBlT2YuYmluZCh0aGlzKSxcbiAgICB9O1xuICB9XG5cbiAgZ3JhcGhRTFF1ZXJ5UmVzdWx0Q29uZmlnKCkge1xuICAgIGNvbnN0IG9iamVjdFR5cGUgPSB0aGlzLmdyYXBoUUxPYmplY3RUeXBlKCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IGAke3RoaXMuZGlzcGxheU5hbWV9UXVlcnlDb25uZWN0aW9uYCxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBub2RlczogeyB0eXBlOiBuZXcgR3JhcGhRTExpc3Qob2JqZWN0VHlwZSkgfSxcbiAgICAgICAgZWRnZXM6IHtcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoXG4gICAgICAgICAgICBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICAgICAgICBuYW1lOiBgJHt0aGlzLmRpc3BsYXlOYW1lfUVkZ2VgLFxuICAgICAgICAgICAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAgICAgICAgICAgbm9kZTogeyB0eXBlOiBvYmplY3RUeXBlIH0sXG4gICAgICAgICAgICAgICAgY3Vyc29yOiB7IHR5cGU6IEdyYXBoUUxTdHJpbmcgfSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICAgIHBhZ2VJbmZvOiB7IHR5cGU6IFBhZ2VJbmZvIH0sXG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICBncmFwaFFMTXV0YXRpb25SZXN1bHRDb25maWcoKSB7XG4gICAgY29uc3Qgb2JqZWN0VHlwZSA9IHRoaXMuZ3JhcGhRTE9iamVjdFR5cGUoKTtcbiAgICByZXR1cm4ge1xuICAgICAgbmFtZTogYCR7dGhpcy5kaXNwbGF5TmFtZX1NdXRhdGlvbkNvbXBsZXRlUGF5bG9hZGAsXG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgb2JqZWN0OiB7IHR5cGU6IG9iamVjdFR5cGUgfSxcbiAgICAgICAgY2xpZW50TXV0YXRpb25JZDogeyB0eXBlOiBHcmFwaFFMU3RyaW5nIH0sXG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICBncmFwaFFMU3Vic2NyaXB0aW9uQ29uZmlnKCkge1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHRoaXMuY2xhc3NOYW1lO1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiB0aGlzLmRpc3BsYXlOYW1lICsgJ1N1YnNjcmlwdGlvbicsXG4gICAgICBkZXNjcmlwdGlvbjogYFBhcnNlIENsYXNzICR7Y2xhc3NOYW1lfSBTdWJzY3JpcHRpb25gLFxuICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgIGNvbnN0IG9iamVjdEZpZWxkcyA9IHRoaXMuYnVpbGRGaWVsZHMoZ3JhcGhRTFF1ZXJ5RmllbGQpO1xuICAgICAgICBkZWxldGUgb2JqZWN0RmllbGRzLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgb2JqZWN0RmllbGRzLmlkO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGV2ZW50IDoge3R5cGUgOiBFdmVudH0sXG4gICAgICAgICAgb2JqZWN0IDogb2JqZWN0RmllbGRzXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgaXNUeXBlT2Y6IHRoaXMuaXNUeXBlT2YuYmluZCh0aGlzKSxcbiAgICB9O1xuICB9XG5cbiAgZ3JhcGhRTE9iamVjdFR5cGUoKSB7XG4gICAgaWYgKCF0aGlzLm9iamVjdFR5cGUpIHtcbiAgICAgIHRoaXMub2JqZWN0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh0aGlzLmdyYXBoUUxDb25maWcoKSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLm9iamVjdFR5cGU7XG4gIH1cblxuICBncmFwaFFMVXBkYXRlSW5wdXRPYmplY3RUeXBlKCkge1xuICAgIGlmICghdGhpcy51cGRhdGVJbnB1dE9iamVjdFR5cGUpIHtcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRPYmplY3RUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoXG4gICAgICAgIHRoaXMuZ3JhcGhRTFVwZGF0ZUlucHV0Q29uZmlnKClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnVwZGF0ZUlucHV0T2JqZWN0VHlwZTtcbiAgfVxuXG4gIGdyYXBoUUxJbnB1dE9iamVjdFR5cGUoKSB7XG4gICAgaWYgKCF0aGlzLmlucHV0T2JqZWN0VHlwZSkge1xuICAgICAgdGhpcy5pbnB1dE9iamVjdFR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZShcbiAgICAgICAgdGhpcy5ncmFwaFFMSW5wdXRDb25maWcoKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuaW5wdXRPYmplY3RUeXBlO1xuICB9XG5cbiAgZ3JhcGhRTFF1ZXJ5SW5wdXRPYmplY3RUeXBlKCkge1xuICAgIGlmICghdGhpcy5xdWVyeUlucHV0T2JqZWN0VHlwZSkge1xuICAgICAgdGhpcy5xdWVyeUlucHV0T2JqZWN0VHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKFxuICAgICAgICB0aGlzLmdyYXBoUUxRdWVyeUNvbmZpZygpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5xdWVyeUlucHV0T2JqZWN0VHlwZTtcbiAgfVxuXG4gIGdyYXBoUUxRdWVyeVJlc3VsdFR5cGUoKSB7XG4gICAgaWYgKCF0aGlzLnF1ZXJ5UmVzdWx0T2JqZWN0VHlwZSkge1xuICAgICAgdGhpcy5xdWVyeVJlc3VsdE9iamVjdFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoXG4gICAgICAgIHRoaXMuZ3JhcGhRTFF1ZXJ5UmVzdWx0Q29uZmlnKClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnF1ZXJ5UmVzdWx0T2JqZWN0VHlwZTtcbiAgfVxuXG4gIGdyYXBoUUxNdXRhdGlvblJlc3VsdFR5cGUoKSB7XG4gICAgaWYgKCF0aGlzLm11dGF0aW9uUmVzdWx0T2JqZWN0VHlwZSkge1xuICAgICAgdGhpcy5tdXRhdGlvblJlc3VsdE9iamVjdFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoXG4gICAgICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uUmVzdWx0Q29uZmlnKClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLm11dGF0aW9uUmVzdWx0T2JqZWN0VHlwZTtcbiAgfVxuXG4gIGdyYXBoUUxTdWJzY3JpcHRpb25UeXBlKCkge1xuICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25UeXBlKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvblR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoXG4gICAgICAgIHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbkNvbmZpZygpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zdWJzY3JpcHRpb25UeXBlO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQYXJzZUNsYXNzUXVlcnlGaWVsZHMoc2NoZW1hKSB7XG4gIHJldHVybiBzY2hlbWEuX19jbGFzc05hbWVzLnJlZHVjZSgoZmllbGRzLCBjbGFzc05hbWUpID0+IHtcbiAgICBjb25zdCB7IGdldCwgZmluZCwgZGlzcGxheU5hbWUgfSA9IGxvYWRDbGFzcyhjbGFzc05hbWUsIHNjaGVtYSk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oZmllbGRzLCB7XG4gICAgICBbZGlzcGxheU5hbWVdOiBnZXQsXG4gICAgICBbYGZpbmQke2Rpc3BsYXlOYW1lfWBdOiBmaW5kLFxuICAgIH0pO1xuICB9LCB7fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQYXJzZUNsYXNzTXV0YXRpb25GaWVsZHMoc2NoZW1hKSB7XG4gIHJldHVybiBzY2hlbWEuX19jbGFzc05hbWVzLnJlZHVjZSgoZmllbGRzLCBjbGFzc05hbWUpID0+IHtcbiAgICBjb25zdCB7IGNyZWF0ZSwgdXBkYXRlLCBkZXN0cm95LCBkaXNwbGF5TmFtZSB9ID0gbG9hZENsYXNzKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hXG4gICAgKTtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihmaWVsZHMsIHtcbiAgICAgIFtgYWRkJHtkaXNwbGF5TmFtZX1gXTogY3JlYXRlLFxuICAgICAgW2B1cGRhdGUke2Rpc3BsYXlOYW1lfWBdOiB1cGRhdGUsXG4gICAgICBbYGRlc3Ryb3kke2Rpc3BsYXlOYW1lfWBdOiBkZXN0cm95LFxuICAgIH0pO1xuICB9LCB7fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQYXJzZUNsYXNzU3Vic2NyaXB0aW9uRmllbGQoc2NoZW1hKSB7XG4gIHJldHVybiBzY2hlbWEuX19jbGFzc05hbWVzLnJlZHVjZSgoZmllbGRzLCBjbGFzc05hbWUpID0+IHtcbiAgICBjb25zdCB7IHN1YnNjcmliZSwgZGlzcGxheU5hbWUgfSA9IGxvYWRDbGFzcyhcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHNjaGVtYVxuICAgICk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oZmllbGRzLHtbYHN1YnNjcmliZSR7ZGlzcGxheU5hbWV9YF06IHN1YnNjcmliZX0pO1xuICB9LCB7fSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgUXVlcnk6IGdldFBhcnNlQ2xhc3NRdWVyeUZpZWxkcyxcbiAgTXV0YXRpb246IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkZpZWxkcyxcbiAgU3Vic2NyaXB0aW9uOiBnZXRQYXJzZUNsYXNzU3Vic2NyaXB0aW9uRmllbGRcbn07XG4iXX0=