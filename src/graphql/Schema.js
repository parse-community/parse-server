import { getNode } from './node';
import {
  loadClass,
  clearCache,
} from './ParseClass';

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
      description: `The full parse schema`,
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
    return new GraphQLObjectType({
      name: 'Mutation',
      fields: () =>  this.schema
        .__classNames
        .reduce((fields, className) => {
          const {
            create, update, destroy
          } = loadClass(className, this.schema);
          fields[`create${className}`] = create;
          fields[`update${className}`] = update;
          fields[`destroy${className}`] = destroy;
          return fields;
        }, {})
    });
  }

  Root() {
    return this.schema.__classNames.reduce((memo, className) => {
      memo[className] = {}
      return memo;
    }, {});
  }
}
