export var __esModule: boolean;
export default _default;
export const GraphQLConfigClassName: "_GraphQLConfig";
export const GraphQLConfigId: "1";
export const GraphQLConfigKey: "config";
declare var _default: typeof ParseGraphQLController;
declare class ParseGraphQLController {
    constructor(params?: {});
    databaseController: any;
    cacheController: any;
    isMounted: boolean;
    configCacheKey: string;
    getGraphQLConfig(): Promise<any>;
    updateGraphQLConfig(graphQLConfig: any): Promise<{
        response: {
            result: boolean;
        };
    }>;
    _getCachedGraphQLConfig(): any;
    _putCachedGraphQLConfig(graphQLConfig: any): any;
    _validateGraphQLConfig(graphQLConfig: any): void;
    _validateClassConfig(classConfig: any): string;
}
