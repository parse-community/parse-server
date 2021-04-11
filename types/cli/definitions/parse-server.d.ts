export var __esModule: boolean;
export default _default;
declare var _default: {
    accountLockout: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    allowClientClassCreation: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    allowCustomObjectId: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    allowHeaders: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").arrayParser;
    };
    allowOrigin: {
        env: string;
        help: string;
    };
    analyticsAdapter: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").moduleOrObjectParser;
    };
    appId: {
        env: string;
        help: string;
        required: boolean;
    };
    appName: {
        env: string;
        help: string;
    };
    auth: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    cacheAdapter: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").moduleOrObjectParser;
    };
    cacheMaxSize: {
        env: string;
        help: string;
        action: (opt: any) => number;
        default: number;
    };
    cacheTTL: {
        env: string;
        help: string;
        action: (opt: any) => number;
        default: number;
    };
    clientKey: {
        env: string;
        help: string;
    };
    cloud: {
        env: string;
        help: string;
    };
    cluster: {
        env: string;
        help: string;
        action: any;
    };
    collectionPrefix: {
        env: string;
        help: string;
        default: string;
    };
    customPages: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
        default: {};
    };
    databaseAdapter: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").moduleOrObjectParser;
    };
    databaseOptions: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    databaseURI: {
        env: string;
        help: string;
        required: boolean;
        default: string;
    };
    directAccess: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    dotNetKey: {
        env: string;
        help: string;
    };
    emailAdapter: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").moduleOrObjectParser;
    };
    emailVerifyTokenReuseIfValid: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    emailVerifyTokenValidityDuration: {
        env: string;
        help: string;
        action: (opt: any) => number;
    };
    enableAnonymousUsers: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    enableExpressErrorHandler: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    encryptionKey: {
        env: string;
        help: string;
    };
    expireInactiveSessions: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    fileKey: {
        env: string;
        help: string;
    };
    filesAdapter: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").moduleOrObjectParser;
    };
    fileUpload: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
        default: {};
    };
    graphQLPath: {
        env: string;
        help: string;
        default: string;
    };
    graphQLSchema: {
        env: string;
        help: string;
    };
    host: {
        env: string;
        help: string;
        default: string;
    };
    idempotencyOptions: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
        default: {};
    };
    javascriptKey: {
        env: string;
        help: string;
    };
    jsonLogs: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
    };
    liveQuery: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    liveQueryServerOptions: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    loggerAdapter: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").moduleOrObjectParser;
    };
    logLevel: {
        env: string;
        help: string;
    };
    logsFolder: {
        env: string;
        help: string;
        default: string;
    };
    masterKey: {
        env: string;
        help: string;
        required: boolean;
    };
    masterKeyIps: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").arrayParser;
        default: any[];
    };
    maxLimit: {
        env: string;
        help: string;
        action: (opt: any) => number;
    };
    maxLogFiles: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    maxUploadSize: {
        env: string;
        help: string;
        default: string;
    };
    middleware: {
        env: string;
        help: string;
    };
    mountGraphQL: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    mountPath: {
        env: string;
        help: string;
        default: string;
    };
    mountPlayground: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    objectIdSize: {
        env: string;
        help: string;
        action: (opt: any) => number;
        default: number;
    };
    pages: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
        default: {};
    };
    passwordPolicy: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    playgroundPath: {
        env: string;
        help: string;
        default: string;
    };
    port: {
        env: string;
        help: string;
        action: (opt: any) => number;
        default: number;
    };
    preserveFileName: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    preventLoginWithUnverifiedEmail: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    protectedFields: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
        default: {
            _User: {
                '*': string[];
            };
        };
    };
    publicServerURL: {
        env: string;
        help: string;
    };
    push: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
    };
    readOnlyMasterKey: {
        env: string;
        help: string;
    };
    restAPIKey: {
        env: string;
        help: string;
    };
    revokeSessionOnPasswordReset: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    scheduledPush: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    security: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").objectParser;
        default: {};
    };
    serverCloseComplete: {
        env: string;
        help: string;
    };
    serverStartComplete: {
        env: string;
        help: string;
    };
    serverURL: {
        env: string;
        help: string;
        required: boolean;
    };
    sessionLength: {
        env: string;
        help: string;
        action: (opt: any) => number;
        default: number;
    };
    silent: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
    };
    startLiveQueryServer: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
    };
    userSensitiveFields: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").arrayParser;
    };
    verbose: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
    };
    verifyUserEmails: {
        env: string;
        help: string;
        action: typeof import("../../Options/parsers").booleanParser;
        default: boolean;
    };
    webhookKey: {
        env: string;
        help: string;
    };
};
