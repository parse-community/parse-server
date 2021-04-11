export var __esModule: boolean;
export class ParseGraphQLSchema {
    constructor(params?: {});
    parseGraphQLController: any;
    databaseController: any;
    log: any;
    graphQLCustomTypeDefs: any;
    appId: any;
    schemaCache: any;
    load(): Promise<any>;
    parseClasses: any;
    parseClassesString: string;
    parseGraphQLConfig: any;
    functionNames: any[];
    functionNamesString: string;
    parseClassTypes: {};
    viewerType: any;
    graphQLAutoSchema: _graphql.GraphQLSchema;
    graphQLSchema: any;
    graphQLTypes: any[];
    graphQLQueries: {};
    graphQLMutations: {};
    graphQLSubscriptions: {};
    graphQLSchemaDirectivesDefinitions: any;
    graphQLSchemaDirectives: {};
    relayNodeInterface: any;
    addGraphQLType(type: any, throwError?: boolean, ignoreReserved?: boolean, ignoreConnection?: boolean): any;
    addGraphQLQuery(fieldName: any, field: any, throwError?: boolean, ignoreReserved?: boolean): any;
    addGraphQLMutation(fieldName: any, field: any, throwError?: boolean, ignoreReserved?: boolean): any;
    handleError(error: any): void;
    _initializeSchemaAndConfig(): Promise<{
        parseGraphQLConfig: any;
    }>;
    schemaController: any;
    /**
     * Gets all classes found by the `schemaController`
     * minus those filtered out by the app's parseGraphQLConfig.
     */
    _getClassesForSchema(parseGraphQLConfig: any): Promise<any>;
    isUsersClassDisabled: boolean;
    /**
     * This method returns a list of tuples
     * that provide the parseClass along with
     * its parseClassConfig where provided.
     */
    _getParseClassesWithConfig(parseClasses: any, parseGraphQLConfig: any): any;
    _getFunctionNames(): Promise<any[]>;
    /**
     * Checks for changes to the parseClasses
     * objects (i.e. database schema) or to
     * the parseGraphQLConfig object. If no
     * changes are found, return true;
     */
    _hasSchemaInputChanged(params: any): boolean;
}
import _graphql = require("graphql");
