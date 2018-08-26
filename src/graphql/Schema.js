
import {
  GraphQLSchema,
  GraphQLObjectType,
} from 'graphql'

import {
  clearCache,
} from './typesCache';
import Config from '../Config';

import ParseClassSchema from './schemas/ParseClass';
import UserAuthSchema from './schemas/UserAuth';
import NodeSchema from './schemas/Node';

export class GraphQLParseSchema {
  schema;
  applicationId;

  constructor(applicationId) {
    this.applicationId = applicationId;
  }

  async load() {
    const schema = await Config.get(this.applicationId).database.loadSchema();
    const allClasses = await schema.getAllClasses(true);
    const classNames = [];
    const fullSchema = allClasses.reduce((memo, classDef) => {
      memo[classDef.className] = classDef;
      classNames.push(classDef.className);
      return memo;
    }, {});
    fullSchema.__classNames = classNames;
    this.schema = Object.freeze(fullSchema);
    const graphQLSchema = new GraphQLSchema({
      query: this.Query(),
      mutation: this.Mutation(),
    });
    clearCache();
    return { schema: graphQLSchema, rootValue: this.Root() };
  }

  Query() {
    return new GraphQLObjectType({
      name: 'Query',
      description: `The query root of you Parse Server's graphQL interface`,
      fields: () => {
        const fields = {};
        Object.assign(fields, NodeSchema.Query(this.schema));
        Object.assign(fields, UserAuthSchema.Query(this.schema));
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
