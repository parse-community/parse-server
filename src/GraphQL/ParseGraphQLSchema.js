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
import ParseGraphQLController, {
  ParseGraphQLConfig,
} from '../Controllers/ParseGraphQLController';
import DatabaseController from '../Controllers/DatabaseController';
import { toGraphQLError } from './parseGraphQLUtils';
import * as schemaDirectives from './loaders/schemaDirectives';

class ParseGraphQLSchema {
  databaseController: DatabaseController;
  parseGraphQLController: ParseGraphQLController;
  parseGraphQLConfig: ParseGraphQLConfig;
  graphQLCustomTypeDefs: any;

  constructor(
    params: {
      databaseController: DatabaseController,
      parseGraphQLController: ParseGraphQLController,
      log: any,
    } = {}
  ) {
    this.parseGraphQLController =
      params.parseGraphQLController ||
      requiredParameter('You must provide a parseGraphQLController instance!');
    this.databaseController =
      params.databaseController ||
      requiredParameter('You must provide a databaseController instance!');
    this.log =
      params.log || requiredParameter('You must provide a log instance!');
    this.graphQLCustomTypeDefs = params.graphQLCustomTypeDefs;
  }

  async load() {
    const { parseGraphQLConfig } = await this._initializeSchemaAndConfig();

    const parseClasses = await this._getClassesForSchema(parseGraphQLConfig);
    const parseClassesString = JSON.stringify(parseClasses);

    if (
      this.graphQLSchema &&
      !this._hasSchemaInputChanged({
        parseClasses,
        parseClassesString,
        parseGraphQLConfig,
      })
    ) {
      return this.graphQLSchema;
    }

    this.parseClasses = parseClasses;
    this.parseClassesString = parseClassesString;
    this.parseGraphQLConfig = parseGraphQLConfig;
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

    this._getParseClassesWithConfig(parseClasses, parseGraphQLConfig).forEach(
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

  async _initializeSchemaAndConfig() {
    const [schemaController, parseGraphQLConfig] = await Promise.all([
      this.databaseController.loadSchema(),
      this.parseGraphQLController.getGraphQLConfig(),
    ]);

    this.schemaController = schemaController;

    return {
      parseGraphQLConfig,
    };
  }

  /**
   * Gets all classes found by the `schemaController`
   * minus those filtered out by the app's parseGraphQLConfig.
   */
  async _getClassesForSchema(parseGraphQLConfig: ParseGraphQLConfig) {
    const { enabledForClasses, disabledForClasses } = parseGraphQLConfig;
    const allClasses = await this.schemaController.getAllClasses();

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
  _getParseClassesWithConfig(
    parseClasses,
    parseGraphQLConfig: ParseGraphQLConfig
  ) {
    const { classConfigs } = parseGraphQLConfig;
    return parseClasses.map(parseClass => {
      let parseClassConfig;
      if (classConfigs) {
        parseClassConfig = classConfigs.find(
          c => c.className === parseClass.className
        );
      }
      return [parseClass, parseClassConfig];
    });
  }

  /**
   * Checks for changes to the parseClasses
   * objects (i.e. database schema) or to
   * the parseGraphQLConfig object. If no
   * changes are found, return true;
   */
  _hasSchemaInputChanged(params: {
    parseClasses: any,
    parseClassesString: string,
    parseGraphQLConfig: ?ParseGraphQLConfig,
  }): boolean {
    const { parseClasses, parseClassesString, parseGraphQLConfig } = params;

    if (
      JSON.stringify(this.parseGraphQLConfig) ===
      JSON.stringify(parseGraphQLConfig)
    ) {
      if (this.parseClasses === parseClasses) {
        return false;
      }

      if (this.parseClassesString === parseClassesString) {
        this.parseClasses = parseClasses;
        return false;
      }
    }

    return true;
  }
}

export { ParseGraphQLSchema };
