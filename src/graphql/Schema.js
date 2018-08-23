import {
  loadClass,
  clearCache,
} from './ParseClass';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLID,
} from 'graphql'

import rest from '../rest';

// Flatten all graphQL selections to the dot notation.
function reduceSelections(selections, topKey) {
  return selections.reduce((memo, selection) => {
    const value = selection.name.value;
    if (selection.selectionSet === null) {
      memo.push(value);
    } else {
      // Get the sub seletions and add on current key
      const subSelections = reduceSelections(selection.selectionSet.selections, topKey);
      memo = memo.concat(subSelections.map((key) => {
        return value + '.' + key;
      }));
    }
    return memo;
  }, []);
}

// Get the selections for the 1st node in a array of . separated keys
function getSelections(node, topKey) {
  return reduceSelections(node.selectionSet.selections, topKey);
}

function getQueryOptions(info, listKey) {
  const node = info.fieldNodes[0];
  const selections = node.selectionSet.selections;
  const results = selections.filter((selection) => {
    return selection.name.value == listKey;
  });
  const selectedKeys = getSelections(results[0]);
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
function runFind(context, info, className, args) {
  let query = {};
  if (args.where) {
    query = Object.assign(query, args.where);
  }
  if (args.objectId) {
    query = Object.assign(query, { objectId: args.objectId });
  }
  const options = getQueryOptions(info, 'objects');
  if (Object.prototype.hasOwnProperty.call(args, 'limit')) {
    options.limit = args.limit;
  }
  if (Object.prototype.hasOwnProperty.call(args, 'skip')) {
    options.skip = args.skip;
  }
  return rest.find(context.config, context.auth, className, query, options)
    .then(toGraphQLResult(className));
}

// runs a get against the rest API
function runGet(context, info, className, objectId) {
  const options = getQueryOptions(info, 'object');
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
    const schema = new GraphQLSchema({
      query: this.Query(),
      mutation: this.Mutation(),
    });
    clearCache();
    return schema;
  }

  Query() {
    const MainSchemaOptions = {
      name: 'Query',
      description: `The full parse schema`,
      fields: {}
    }
    Object.keys(this.schema).forEach((className) => {
      const {
        queryType, queryResultType
      } = loadClass(className, this.schema);

      MainSchemaOptions.fields[className] = {
        type: queryResultType,
        description: `Use this endpoint to get or query ${className} objects`,
        args: {
          objectId: { type: GraphQLID, name: 'objectId' },
          where: { type: queryType },
          limit: { type: GraphQLInt },
          skip: { type: GraphQLInt }
        },
        resolve: async (root, args, context, info) => {
          // Get the selections
          const objects = await runFind(context, info, className, args);
          return { objects };
        }
      };
    });
    return new GraphQLObjectType(MainSchemaOptions);
  }

  Mutation()  {
    const MainSchemaMutationOptions = {
      name: 'Mutation',
      fields: {}
    }
    // TODO: Refactor FunctionRouter to extract (as it's a new entry)
    // TODO: Implement Functions as mutations

    Object.keys(this.schema).forEach((className) => {
      const {
        inputType, objectType, updateType, mutationResultType
      } = loadClass(className, this.schema);

      MainSchemaMutationOptions.fields['create' + className] = {
        type: mutationResultType,
        fields: objectType.fields,
        description: `use this method to create a new ${className}`,
        args: { input: { type: inputType }},
        name: 'create',
        resolve: async (root, args, context, info) => {
          const res = await rest.create(context.config, context.auth, className, args.input);
          // Run get to match graphQL style
          const object = await runGet(context, info, className, res.response.objectId);
          return { object };
        }
      }

      MainSchemaMutationOptions.fields['update' + className] = {
        type: mutationResultType,
        description: `use this method to update an existing ${className}`,
        args: {
          objectId: { type: new GraphQLNonNull(GraphQLID), name: 'objectId' },
          input: { type: updateType }
        },
        name: 'update',
        resolve: async (root, args, context, info) => {
          const objectId = args.objectId;
          const input = args.input;
          await rest.update(context.config, context.auth, className, { objectId }, input);
          // Run get to match graphQL style
          const object = await runGet(context, info, className, objectId);
          return { object };
        }
      }

      MainSchemaMutationOptions.fields['destroy' + className] = {
        type: mutationResultType,
        description: `use this method to update delete an existing ${className}`,
        args: {
          objectId: { type: new GraphQLNonNull(GraphQLID), name: 'objectId' }
        },
        name: 'destroy',
        resolve: async (root, args, context, info) => {
          const object = await runGet(context, info, className, args.objectId);
          await rest.del(context.config, context.auth, className, args.objectId);
          return { object }
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
