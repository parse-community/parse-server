import Parse from 'parse/node';
import { GraphQLSchema, GraphQLObjectType } from 'graphql';
import { ApolloError } from 'apollo-server-core';
import requiredParameter from '../requiredParameter';
import * as defaultGraphQLTypes from './loaders/defaultGraphQLTypes';
import * as parseClassTypes from './loaders/parseClassTypes';
import * as parseClassQueries from './loaders/parseClassQueries';
import * as parseClassMutations from './loaders/parseClassMutations';
import * as defaultGraphQLQueries from './loaders/defaultGraphQLQueries';
import * as defaultGraphQLMutations from './loaders/defaultGraphQLMutations';

class ParseGraphQLSchema {
  constructor(databaseController, log) {
    this.databaseController =
      databaseController ||
      requiredParameter('You must provide a databaseController instance!');
    this.log = log || requiredParameter('You must provide a log instance!');
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
    this.meType = null;
    this.graphQLSchema = null;
    this.graphQLTypes = [];
    this.graphQLObjectsQueries = {};
    this.graphQLQueries = {};
    this.graphQLObjectsMutations = {};
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

  handleError(error) {
    let code, message;
    if (error instanceof Parse.Error) {
      this.log.error('Parse error: ', error);
      code = error.code;
      message = error.message;
    } else {
      this.log.error('Uncaught internal server error.', error, error.stack);
      code = Parse.Error.INTERNAL_SERVER_ERROR;
      message = 'Internal server error.';
    }
    throw new ApolloError(message, code);
  }
}

export { ParseGraphQLSchema };
