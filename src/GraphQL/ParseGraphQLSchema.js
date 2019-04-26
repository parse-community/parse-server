import { GraphQLSchema, GraphQLObjectType } from 'graphql';
import requiredParameter from '../requiredParameter';
import * as defaultGraphQLTypes from './loaders/defaultGraphQLTypes';
import * as parseClassTypes from './loaders/parseClassTypes';
import * as parseClassQueries from './loaders/parseClassQueries';
import * as parseClassMutations from './loaders/parseClassMutations';
import * as defaultGraphQLQueries from './loaders/defaultGraphQLQueries';
import * as defaultGraphQLMutations from './loaders/defaultGraphQLMutations';

class ParseGraphQLSchema {
  constructor(databaseController) {
    this.databaseController =
      databaseController ||
      requiredParameter('You must provide a databaseController instance!');
  }

  async load() {
    const schemaController = await this.databaseController.loadSchema();
    const parseClasses = await schemaController.getAllClasses();
    const parseClassesString = JSON.stringify(parseClasses);

    if (this.graphQLSchema) {
      if (this.parseClasses === parseClasses) {
        return this.graphQLSchema;
      }

      if (this.parseClassesString === parseClassesString) {
        this.parseClasses = parseClasses;
        return this.graphQLSchema;
      }
    }

    this.parseClasses = parseClasses;
    this.parseClassesString = parseClassesString;
    this.parseClassTypes = {};
    this.graphQLSchema = null;
    this.graphQLTypes = [];
    this.graphQLQueries = {};
    this.graphQLMutations = {};
    this.graphQLSubscriptions = {};

    defaultGraphQLTypes.load(this);

    parseClasses.forEach(parseClass => {
      parseClassTypes.load(this, parseClass);

      parseClassQueries.load(this, parseClass);

      parseClassMutations.load(this, parseClass);
    });

    defaultGraphQLQueries.load(this);

    defaultGraphQLMutations.load(this);

    let graphQLQuery = undefined;
    if (Object.keys(this.graphQLQueries).length > 0) {
      graphQLQuery = new GraphQLObjectType({
        name: 'Query',
        description: 'Query is the top level type for queries.',
        fields: this.graphQLQueries,
      });
      this.graphQLTypes.push(graphQLQuery);
    }

    let graphQLMutation = undefined;
    if (Object.keys(this.graphQLMutations).length > 0) {
      graphQLMutation = new GraphQLObjectType({
        name: 'Mutation',
        description: 'Mutation is the top level type for mutations.',
        fields: this.graphQLMutations,
      });
      this.graphQLTypes.push(graphQLMutation);
    }

    let graphQLSubscription = undefined;
    if (Object.keys(this.graphQLSubscriptions).length > 0) {
      graphQLSubscription = new GraphQLObjectType({
        name: 'Subscription',
        description: 'Subscription is the top level type for subscriptions.',
        fields: this.graphQLSubscriptions,
      });
      this.graphQLTypes.push(graphQLSubscription);
    }

    this.graphQLSchema = new GraphQLSchema({
      types: this.graphQLTypes,
      query: graphQLQuery,
      mutation: graphQLMutation,
      subscription: graphQLSubscription,
    });

    return this.graphQLSchema;
  }
}

export { ParseGraphQLSchema };
