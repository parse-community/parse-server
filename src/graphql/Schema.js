
import {
  clearCache,
} from './typesCache';

import ParseClassSchema from './schemas/ParseClass';

import UserAuthSchema from './schemas/UserAuth';
import NodeSchema from './schemas/Node';

import {
  GraphQLSchema,
  GraphQLObjectType,
} from 'graphql'

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
        const fields = {};
        Object.assign(fields, NodeSchema.Query(this.schema));
        Object.assign(fields, ParseClassSchema.Query(this.schema));
        return fields;
      },
    });
  }

  Mutation()  {
    // TODO: Refactor FunctionRouter to extract (as it's a new entry)
    // TODO: Implement Functions as mutations
    const fields = {};
    Object.assign(fields, UserAuthSchema.Mutation(this.schema));
    Object.assign(fields, ParseClassSchema.Mutation(this.schema));

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
