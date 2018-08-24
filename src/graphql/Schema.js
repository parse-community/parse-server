import { runFind, runGet } from './execute';
import {
  Node,
  loadClass,
  clearCache,
} from './ParseClass';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLID,
  GraphQLFieldConfigMap,
  GraphQLString,
} from 'graphql'

import rest from '../rest';

function base64(string) {
  return new Buffer(string).toString('base64')
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
        queryType, queryResultType, objectType
      } = loadClass(className, this.schema);

      const get: GraphQLFieldConfigMap = {
        type: objectType,
        description: `Use this endpoint to get or query ${className} objects`,
        args: {
          objectId: { type: GraphQLID },
        },
        resolve: async (root, args, context, info) => {
          // Get the selections
          return await runGet(context, info, className, args.objectId, this.schema);
        }
      };
      fields[`${className}`] = get;

      const findField: GraphQLFieldConfigMap = {
        type: queryResultType,
        description: `Use this endpoint to get or query ${className} objects`,
        args: {
          where: { type: queryType },
          first: { type: GraphQLInt },
          last: { type: GraphQLInt },
          after: { type: GraphQLString },
          before: { type: GraphQLString }
        },
        resolve: async (root, args, context, info) => {
          // Get the selections
          const pageSize = args.first || args.last || 100;
          const results = await runFind(context, info, className, args, this.schema);
          return {
            nodes: () => results,
            edges: () => results.map((node) => {
              return {
                cursor: base64(node.createdAt),
                node
              };
            }),
            pageInfo: () => {
              const hasPreviousPage = () => {
                if (args.last) {
                  return results.length === pageSize;
                }
                if (args.after) {
                  return true;
                }
                return false;
              };
              const hasNextPage = () => {
                if (args.first) {
                  return results.length === pageSize;
                }
                if (args.before) {
                  return true;
                }
                return false;
              };
              return {
                hasNextPage,
                hasPreviousPage,
              }
            }
          };
        }
      };
      fields[`find${className}`] = findField;
    });

    fields.node = {
      type: Node,
      description: `Commong endpoint`,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
      },
      resolve: async (root, args, context, info) => {
        // Get the selections
        const components = new Buffer(args.id, 'base64').toString('utf8').split('::');
        if (components.length != 2) {
          throw new Error('Invalid ID');
        }
        return await runGet(context, info, components[0], components[1], this.schema);
      }
    }
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
