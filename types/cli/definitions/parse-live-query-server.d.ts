export var __esModule: boolean;
export default _default;
declare var _default: {
    appId: {
        env: string;
        help: string;
    };
    cacheTimeout: {
        env: string;
        help: string;
        action: (opt: any) => number;
    };
    keyPairs: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    logLevel: {
        env: string;
        help: string;
    };
    masterKey: {
        env: string;
        help: string;
    };
    port: {
        env: string;
        help: string;
        action: (opt: any) => number;
        default: number;
    };
    pubSubAdapter: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").moduleOrObjectParser;
    };
    redisOptions: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    redisURL: {
        env: string;
        help: string;
    };
    serverURL: {
        env: string;
        help: string;
    };
    websocketTimeout: {
        env: string;
        help: string;
        action: (opt: any) => number;
    };
    wssAdapter: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").moduleOrObjectParser;
    };
};
