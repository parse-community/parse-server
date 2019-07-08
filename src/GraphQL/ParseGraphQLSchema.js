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
import { ParseGraphQLSchemaConfig } from '../Options/index';

class ParseGraphQLSchema {
  constructor(
    databaseController,
    log,
    graphQLSchemaConfig: ?ParseGraphQLSchemaConfig
  ) {
    this.databaseController =
      databaseController ||
      requiredParameter('You must provide a databaseController instance!');
    this.log = log || requiredParameter('You must provide a log instance!');
    this.graphQLSchemaConfig = graphQLSchemaConfig || {};
  }

  async load() {
    const parseClasses = await this._getClassesForSchema();
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

    this._getParseClassesWithConfig(parseClasses).forEach(
      ([parseClass, parseClassConfig]) => {
        parseClassTypes.load(this, parseClass, parseClassConfig);
        parseClassQueries.load(this, parseClass, parseClassConfig);
        parseClassMutations.load(this, parseClass, parseClassConfig);
      }
    );

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

  /**
   * Gets all classes found by the `schemaController`
   * minus those filtered out by the app's configuration
   */
  async _getClassesForSchema() {
    const { enabledForClasses, disabledForClasses } = this.graphQLSchemaConfig;
    const schemaController = await this.databaseController.loadSchema();

    const allClasses = await schemaController.getAllClasses();
    if (Array.isArray(enabledForClasses) || Array.isArray(disabledForClasses)) {
      let includedClasses = allClasses;
      if (enabledForClasses) {
        includedClasses = allClasses.filter(clazz => {
          return enabledForClasses.includes(clazz.className);
        });
      }
      if (disabledForClasses) {
        // Classes included in `enabledForClasses` that
        // are also present in `disabledForClasses` will
        // still be filtered out
        includedClasses = includedClasses.filter(clazz => {
          return !disabledForClasses.includes(clazz.className);
        });
      }

      this.isUsersClassDisabled = !includedClasses.some(clazz => {
        return clazz.className === '_User';
      });

      return includedClasses;
    } else {
      return allClasses;
    }
  }

  /**
   * This method returns a list of tuples
   * that provide the parseClass along with
   * its parseClassConfig where provided.
   */
  _getParseClassesWithConfig(parseClasses) {
    const { parseClassConfigResolver } = this.graphQLSchemaConfig;
    return parseClasses.map(parseClass => {
      let parseClassConfig;
      if (parseClassConfigResolver) {
        parseClassConfig = parseClassConfigResolver(parseClass.className);
      }
      return [parseClass, parseClassConfig];
    });
  }
}

export { ParseGraphQLSchema };
