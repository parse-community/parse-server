export var __esModule: boolean;
export class ParseGraphQLServer {
    constructor(parseServer: any, config: any);
    parseServer: any;
    config: any;
    parseGraphQLController: any;
    log: any;
    parseGraphQLSchema: _ParseGraphQLSchema.ParseGraphQLSchema;
    _getGraphQLOptions(req: any): Promise<{
        schema: any;
        context: {
            info: any;
            config: any;
            auth: any;
        };
        formatError: (error: any) => any;
    }>;
    _transformMaxUploadSizeToBytes(maxUploadSize: any): number;
    applyGraphQL(app: any): void;
    applyPlayground(app: any): void;
    createSubscriptions(server: any): void;
    setGraphQLConfig(graphQLConfig: any): any;
}
import _ParseGraphQLSchema = require("./ParseGraphQLSchema");
