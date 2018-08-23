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
  GraphQLObjectTypeConfig,
  GraphQLFieldConfigMap,
} from 'graphql'

import rest from '../rest';

// Flatten all graphQL selections to the dot notation.
function reduceSelections(selections, topKey) {
  return selections.reduce((memo, selection) => {
    const value = selection.name.value;
    if (selection.selectionSet === null || selection.selectionSet === undefined) {
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

function transform(constraintKey, currentValue) {
  let value = currentValue;
  if (constraintKey === 'nearSphere') {
    value = {
      latitude: currentValue.point.latitude,
      longitude: currentValue.point.longitude,
    }
  }
  const key = `$${constraintKey}`;

  return {
    key,
    value,
  }
}

function transformQuery(query) {
  Object.keys(query).forEach((key) => {
    Object.keys(query[key]).forEach((constraintKey) => {
      const constraint = query[key][constraintKey];
      delete query[key][constraintKey];
      const result = transform(constraintKey, constraint);
      query[key][result.key] = result.value;
    });
  });
  return query;
}

function transformInput(input, schema) {
  const { fields } = schema;
  Object.keys(input).forEach((key) => {
    const value = input[key];
    if (fields[key] && fields[key].type === 'Pointer') {
      value.__type = 'Pointer';
    } else if (fields[key] && fields[key].type === 'GeoPoint') {
      value.__type = 'GeoPoint';
    }
  });
  return input;
}

// Runs a find against the rest API
function runFind(context, info, className, args, schema) {
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
  query = transformQuery(query, schema);
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
    const fields = {};
    Object.keys(this.schema).forEach((className) => {
      const {
        queryType, queryResultType
      } = loadClass(className, this.schema);

      const field: GraphQLFieldConfigMap = {
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
          const objects = await runFind(context, info, className, args, this.schema[className]);
          return { objects };
        }
      };
      fields[className] = field;
    });
    return new GraphQLObjectType({
      name: 'Query',
      description: `The full parse schema`,
      fields,
    });
  }

  Mutation()  {
    // TODO: Refactor FunctionRouter to extract (as it's a new entry)
    // TODO: Implement Functions as mutations
    const fields = {};
    Object.keys(this.schema).forEach((className) => {
      const {
        inputType, objectType, updateType, mutationResultType
      } = loadClass(className, this.schema);

      fields[`create${className}`] = {
        type: mutationResultType,
        fields: objectType.fields,
        description: `use this method to create a new ${className}`,
        args: { input: { type: inputType }},
        resolve: async (root, args, context, info) => {
          const input = transformInput(args.input, this.schema[className]);
          const res = await rest.create(context.config, context.auth, className, input);
          // Run get to match graphQL style
          const object = await runGet(context, info, className, res.response.objectId);
          return { object };
        }
      }

      fields[`update${className}`] = {
        type: mutationResultType,
        description: `use this method to update an existing ${className}`,
        args: {
          objectId: { type: new GraphQLNonNull(GraphQLID) },
          input: { type: updateType }
        },
        resolve: async (root, args, context, info) => {
          const objectId = args.objectId;
          const input = transformInput(args.input, this.schema[className]);
          await rest.update(context.config, context.auth, className, { objectId }, input);
          // Run get to match graphQL style
          const object = await runGet(context, info, className, objectId);
          return { object };
        }
      }

      fields[`destroy${className}`] = {
        type: mutationResultType,
        description: `use this method to update delete an existing ${className}`,
        args: {
          objectId: { type: new GraphQLNonNull(GraphQLID) }
        },
        resolve: async (root, args, context, info) => {
          const object = await runGet(context, info, className, args.objectId);
          await rest.del(context.config, context.auth, className, args.objectId);
          return { object }
        }
      }
    });
    return new GraphQLObjectType({
      name: 'Mutation',
      fields
    });
  }

  Root() {
    return Object.keys(this.schema).reduce((memo, className) => {
      memo[className] = {}
      return memo;
    }, {});
  }
}
