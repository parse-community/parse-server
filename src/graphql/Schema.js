import {
  ParseObject,
  loadClass,
} from './ParseClass';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLID,
} from 'graphql'

import rest from '../rest';

// Flatten all graphQL selections to the dot notation.
function reduceSelections(selections) {
  return selections.reduce((memo, selection) => {
    const value = selection.name.value;
    if (selection.selectionSet === null) {
      memo.push(value);
    } else {
      // Get the sub seletions and add on current key
      const subSelections = reduceSelections(selection.selectionSet.selections);
      memo = memo.concat(subSelections.map((key) => {
        return value + '.' + key;
      }));
    }
    return memo;
  }, []);
}

// Get the selections for the 1st node in a array of . separated keys
function getSelections(info) {
  const node = info.fieldNodes[0];
  return reduceSelections(node.selectionSet.selections);
}

function getQueryOptions(info) {
  const selectedKeys = getSelections(info);
  const keys = selectedKeys.join(',');
  return {
    keys,
    include: keys
  }
}

function injectClassName(className, result) {
  if (Array.isArray(result)) {
    return result.map((res) => injectClassName(className, res));
  }
  return Object.assign({className}, result);
}

function toGraphQLResult(className, singleResult) {
  return (restResult) => {
    const results = restResult.results;
    if (singleResult) {
      return injectClassName(className, results[0]);
    }
    return injectClassName(className, results);
  }
}

// Runs a find against the rest API
function runFind(context, info, className, where) {
  const options = getQueryOptions(info);
  return rest.find(context.config, context.auth, className, where, options)
    .then(toGraphQLResult(className));
}

// runs a get against the rest API
function runGet(context, info, className, objectId) {
  const options = getQueryOptions(info);
  return rest.get(context.config, context.auth, className, objectId, options)
    .then(toGraphQLResult(className, true));
}

export class GraphQLParseSchema {
  schema;
  types;
  applicationId;

  constructor(schema, applicationId) {
    this.schema = schema;
    this.applicationId = applicationId;
    this.types = {};
  }

  Schema() {
    return new GraphQLSchema({
      query: this.Query(),
      mutation: this.Mutation(),
    });
  }

  Query() {
    const MainSchemaOptions = {
      name: 'ParseSchema',
      description: `The full parse schema`,
      fields: {}
    }
    Object.keys(this.schema).forEach((className) => {
      const {
        queryType, objectType, displayName
      } = loadClass(className, this.schema);
      if (className.startsWith('_')) {
        className = className.slice(1) + 's';
      }
      MainSchemaOptions.fields[displayName] = {
        type: new GraphQLList(objectType),
        description: `Use this endpoint to get or query ${className} objects`,
        args: {
          objectId: { type: GraphQLID, name: 'objectId' },
          where: { type: queryType }
        },
        resolve: (root, args, context, info) => {
          // Get the selections
          let query = {};
          if (args.where) {
            query = Object.assign(query, args.where);
          }
          if (args.objectId) {
            query = Object.assign(query, { objectId: args.objectId });
          }
          return runFind(context, info, className, query);
        }
      };
    });
    MainSchemaOptions.fields['ParseObject'] = { type: ParseObject };
    return new GraphQLObjectType(MainSchemaOptions);
  }

  Mutation()  {
    const MainSchemaMutationOptions = {
      name: 'ParseSchemaMutation',
      fields: {}
    }
    // TODO: Refactor FunctionRouter to extract (as it's a new entry)
    // TODO: Implement Functions as mutations

    Object.keys(this.schema).forEach((className) => {
      const {
        inputType, objectType, updateType, displayName
      } = loadClass(className, this.schema);

      MainSchemaMutationOptions.fields['create' + displayName] = {
        type: objectType,
        fields: objectType.fields,
        description: `use this method to create a new ${className}`,
        args: { input: { type: inputType }},
        name: 'create',
        resolve: (root, args, context, info) => {
          return rest.create(context.config, context.auth, className, args.input).then((res) => {
            // Run find to match graphQL style
            return runGet(context, info, className, res.response.objectId);
          });
        }
      }

      MainSchemaMutationOptions.fields['update' + displayName] = {
        type: objectType,
        description: `use this method to update an existing ${className}`,
        args: {
          objectId: { type: new GraphQLNonNull(GraphQLID), name: 'objectId' },
          input: { type: updateType }
        },
        name: 'update',
        resolve: (root, args, context, info) => {
          const objectId = args.objectId;
          const input = args.input;
          return rest.update(context.config, context.auth, className, { objectId }, input).then(() => {
            // Run find to match graphQL style
            return runGet(context, info, className, objectId);
          });
        }
      }

      MainSchemaMutationOptions.fields['destroy' + displayName] = {
        type: objectType,
        description: `use this method to update delete an existing ${className}`,
        args: {
          objectId: { type: new GraphQLNonNull(GraphQLID), name: 'objectId' }
        },
        name: 'destroy',
        resolve: (root, args, context, info) => {
          return runGet(context, info, className, args.objectId).then((object) => {
            return rest.del(context.config, context.auth, className, args.objectId).then(() => {
              return object;
            });
          });
        }
      }
    });
    return new GraphQLObjectType(MainSchemaMutationOptions);
  }

  Root() {
    return Object.keys(this.schema).reduce((memo, className) => {
      memo[className] = {}
      return memo;
    }, {});
  }
}
