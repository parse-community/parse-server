
import {
  GraphQLSchema,
  GraphQLObjectType,
} from 'graphql'

import Config from '../Config';

import ParseClassSchema from './schemas/ParseClass';
import UserAuthSchema from './schemas/UserAuth';
import NodeSchema from './schemas/Node';
import FunctionsSchema from './schemas/Functions';

export class GraphQLParseSchema {
  schema;
  applicationId;

  constructor(applicationId) {
    this.applicationId = applicationId;
  }

  static async loadSchemaFromDatabase(applicationId) {
    const schema = await Config.get(applicationId).database.loadSchema();
    const allClasses = await schema.getAllClasses(true);
    const classNames = [];
    const fullSchema = allClasses.reduce((memo, classDef) => {
      memo[classDef.className] = classDef;
      classNames.push(classDef.className);
      return memo;
    }, {});
    fullSchema.__classNames = classNames;
    return Object.freeze(fullSchema);
  }

  async load() {
    this.schema = await GraphQLParseSchema.loadSchemaFromDatabase(this.applicationId);
    const graphQLSchema = new GraphQLSchema({
      query: this.Query(),
      mutation: this.Mutation(),
    });
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
    const fields = {};
    Object.assign(fields, UserAuthSchema.Mutation(this.schema));
    Object.assign(fields, ParseClassSchema.Mutation(this.schema));
    Object.assign(fields, FunctionsSchema.Mutation(this.schema));

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
