import Parse from 'parse/node';
import { GraphQLSchema, GraphQLObjectType } from 'graphql';
import { mergeSchemas, SchemaDirectiveVisitor } from 'graphql-tools';
import requiredParameter from '../requiredParameter';
import * as defaultGraphQLTypes from './loaders/defaultGraphQLTypes';
import * as parseClassTypes from './loaders/parseClassTypes';
import * as parseClassQueries from './loaders/parseClassQueries';
import * as parseClassMutations from './loaders/parseClassMutations';
import * as defaultGraphQLQueries from './loaders/defaultGraphQLQueries';
import * as defaultGraphQLMutations from './loaders/defaultGraphQLMutations';
import { toGraphQLError } from './parseGraphQLUtils';
import * as schemaDirectives from './loaders/schemaDirectives';

class ParseGraphQLSchema {
  constructor(databaseController, log, graphQLCustomTypeDefs) {
    this.databaseController =
      databaseController ||
      requiredParameter('You must provide a databaseController instance!');
    this.log = log || requiredParameter('You must provide a log instance!');
    this.graphQLCustomTypeDefs = graphQLCustomTypeDefs;
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
    this.graphQLAutoSchema = null;
    this.graphQLSchema = null;
    this.graphQLTypes = [];
    this.graphQLObjectsQueries = {};
    this.graphQLQueries = {};
    this.graphQLObjectsMutations = {};
    this.graphQLMutations = {};
    this.graphQLSubscriptions = {};
    this.graphQLSchemaDirectivesDefinitions = null;
    this.graphQLSchemaDirectives = {};

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

    this.graphQLAutoSchema = new GraphQLSchema({
      types: this.graphQLTypes,
      query: graphQLQuery,
      mutation: graphQLMutation,
      subscription: graphQLSubscription,
    });

    if (this.graphQLCustomTypeDefs) {
      schemaDirectives.load(this);

      this.graphQLSchema = mergeSchemas({
        schemas: [
          this.graphQLSchemaDirectivesDefinitions,
          this.graphQLAutoSchema,
          this.graphQLCustomTypeDefs,
        ],
        mergeDirectives: true,
      });

      const graphQLSchemaTypeMap = this.graphQLSchema.getTypeMap();
      Object.keys(graphQLSchemaTypeMap).forEach(graphQLSchemaTypeName => {
        const graphQLSchemaType = graphQLSchemaTypeMap[graphQLSchemaTypeName];
        if (typeof graphQLSchemaType.getFields === 'function') {
          const graphQLCustomTypeDef = this.graphQLCustomTypeDefs.definitions.find(
            definition => definition.name.value === graphQLSchemaTypeName
          );
          if (graphQLCustomTypeDef) {
            const graphQLSchemaTypeFieldMap = graphQLSchemaType.getFields();
            Object.keys(graphQLSchemaTypeFieldMap).forEach(
              graphQLSchemaTypeFieldName => {
                const graphQLSchemaTypeField =
                  graphQLSchemaTypeFieldMap[graphQLSchemaTypeFieldName];
                if (!graphQLSchemaTypeField.astNode) {
                  const astNode = graphQLCustomTypeDef.fields.find(
                    field => field.name.value === graphQLSchemaTypeFieldName
                  );
                  if (astNode) {
                    graphQLSchemaTypeField.astNode = astNode;
                  }
                }
              }
            );
          }
        }
      });

      SchemaDirectiveVisitor.visitSchemaDirectives(
        this.graphQLSchema,
        this.graphQLSchemaDirectives
      );
    } else {
      this.graphQLSchema = this.graphQLAutoSchema;
    }

    return this.graphQLSchema;
  }

  handleError(error) {
    if (error instanceof Parse.Error) {
      this.log.error('Parse error: ', error);
    } else {
      this.log.error('Uncaught internal server error.', error, error.stack);
    }
    throw toGraphQLError(error);
  }
}

export { ParseGraphQLSchema };
