import { getNode } from './node';
import {
  loadClass,
  clearCache,
} from './ParseClass';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLString,
} from 'graphql'

import { logIn } from '../Controllers/UserAuthentication';

export class GraphQLParseSchema {
  schema;

  constructor(schema) {
    this.schema = schema;
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
    return new GraphQLObjectType({
      name: 'Query',
      description: `The query root of you Parse Server's graphQL interface`,
      fields: () => {
        const fields = { node: getNode(this.schema) };
        this.schema.__classNames.forEach((className) => {
          const {
            get, find
          } = loadClass(className, this.schema);
          fields[`${className}`] = get;
          fields[`find${className}`] = find;
        });
        return fields;
      },
    });
  }

  Mutation()  {
    // TODO: Refactor FunctionRouter to extract (as it's a new entry)
    // TODO: Implement Functions as mutations
    const fields = this.schema
      .__classNames
      .reduce((fields, className) => {
        const {
          create, update, destroy
        } = loadClass(className, this.schema);
        fields[`create${className}`] = create;
        fields[`update${className}`] = update;
        fields[`destroy${className}`] = destroy;
        return fields;
      }, {});

    fields.login = {
      type: new GraphQLObjectType({
        name: 'login_payload_response',
        fields: {
          sessionToken: { type: GraphQLNonNull(GraphQLString) }
        }
      }),
      args: {
        username: { type: GraphQLString },
        password: { type: GraphQLNonNull(GraphQLString) }
      },
      resolve: async (root, args, req) => {
        const user = await logIn(args, req.config, req.auth, req.info && req.info.installationId);
        return { sessionToken: user.sessionToken };
      }
    }

    return new GraphQLObjectType({
      name: 'Mutation',
      fields,
    });
  }

  Root() {
    return this.schema.__classNames.reduce((memo, className) => {
      memo[className] = {}
      return memo;
    }, {});
  }
}
