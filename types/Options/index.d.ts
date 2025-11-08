// This file is manually updated to match src/Options/index.js until typed
import { AnalyticsAdapter } from '../Adapters/Analytics/AnalyticsAdapter';
import { CacheAdapter } from '../Adapters/Cache/CacheAdapter';
import { MailAdapter } from '../Adapters/Email/MailAdapter';
import { FilesAdapter } from '../Adapters/Files/FilesAdapter';
import { LoggerAdapter } from '../Adapters/Logger/LoggerAdapter';
import { PubSubAdapter } from '../Adapters/PubSub/PubSubAdapter';
import { StorageAdapter } from '../Adapters/Storage/StorageAdapter';
import { WSSAdapter } from '../Adapters/WebSocketServer/WSSAdapter';
import { CheckGroup } from '../Security/CheckGroup';
export interface SchemaOptions {
    definitions: any;
    strict?: boolean;
    deleteExtraFields?: boolean;
    recreateModifiedFields?: boolean;
    lockSchemas?: boolean;
    beforeMigration?: () => void | Promise<void>;
    afterMigration?: () => void | Promise<void>;
}
type Adapter<T> = string | T;
type NumberOrBoolean = number | boolean;
type NumberOrString = number | string;
type ProtectedFields = any;
type StringOrStringArray = string | string[];
type RequestKeywordDenylist = {
    key: string;
    value: any;
};
export interface ParseServerOptions {
    appId: string;
    masterKey: (() => void) | string;
    masterKeyTtl?: number;
    maintenanceKey: string;
    serverURL: string;
    masterKeyIps?: (string[]);
    maintenanceKeyIps?: (string[]);
    appName?: string;
    allowHeaders?: (string[]);
    allowOrigin?: StringOrStringArray;
    analyticsAdapter?: Adapter<AnalyticsAdapter>;
    filesAdapter?: Adapter<FilesAdapter>;
    push?: any;
    scheduledPush?: boolean;
    loggerAdapter?: Adapter<LoggerAdapter>;
    jsonLogs?: boolean;
    logsFolder?: string;
    verbose?: boolean;
    logLevel?: string;
    logLevels?: LogLevels;
    maxLogFiles?: NumberOrString;
    silent?: boolean;
    databaseURI: string;
    databaseOptions?: DatabaseOptions;
    databaseAdapter?: Adapter<StorageAdapter>;
    enableCollationCaseComparison?: boolean;
    convertEmailToLowercase?: boolean;
    convertUsernameToLowercase?: boolean;
    cloud?: string;
    collectionPrefix?: string;
    clientKey?: string;
    javascriptKey?: string;
    dotNetKey?: string;
    encryptionKey?: string;
    restAPIKey?: string;
    readOnlyMasterKey?: string;
    webhookKey?: string;
    fileKey?: string;
    preserveFileName?: boolean;
    userSensitiveFields?: (string[]);
    protectedFields?: ProtectedFields;
    enableAnonymousUsers?: boolean;
    allowClientClassCreation?: boolean;
    allowCustomObjectId?: boolean;
    auth?: Record<string, AuthAdapter>;
    enableInsecureAuthAdapters?: boolean;
    maxUploadSize?: string;
    verifyUserEmails?: (boolean | void);
    preventLoginWithUnverifiedEmail?: boolean;
    preventSignupWithUnverifiedEmail?: boolean;
    emailVerifyTokenValidityDuration?: number;
    emailVerifyTokenReuseIfValid?: boolean;
    sendUserEmailVerification?: (boolean | void);
    accountLockout?: AccountLockoutOptions;
    passwordPolicy?: PasswordPolicyOptions;
    cacheAdapter?: Adapter<CacheAdapter>;
    emailAdapter?: Adapter<MailAdapter>;
    encodeParseObjectInCloudFunction?: boolean;
    publicServerURL?: string | (() => string) | (() => Promise<string>);
    pages?: PagesOptions;
    customPages?: CustomPagesOptions;
    liveQuery?: LiveQueryOptions;
    sessionLength?: number;
    extendSessionOnUse?: boolean;
    defaultLimit?: number;
    maxLimit?: number;
    expireInactiveSessions?: boolean;
    revokeSessionOnPasswordReset?: boolean;
    cacheTTL?: number;
    cacheMaxSize?: number;
    directAccess?: boolean;
    enableExpressErrorHandler?: boolean;
    objectIdSize?: number;
    port?: number;
    host?: string;
    mountPath?: string;
    cluster?: NumberOrBoolean;
    middleware?: ((() => void) | string);
    trustProxy?: any;
    startLiveQueryServer?: boolean;
    liveQueryServerOptions?: LiveQueryServerOptions;
    idempotencyOptions?: IdempotencyOptions;
    fileUpload?: FileUploadOptions;
    graphQLSchema?: string;
    mountGraphQL?: boolean;
    graphQLPath?: string;
    mountPlayground?: boolean;
    playgroundPath?: string;
    schema?: SchemaOptions;
    serverCloseComplete?: () => void;
    security?: SecurityOptions;
    enforcePrivateUsers?: boolean;
    allowExpiredAuthDataToken?: boolean;
    requestKeywordDenylist?: (RequestKeywordDenylist[]);
    rateLimit?: (RateLimitOptions[]);
    verifyServerUrl?: boolean;
}
export interface RateLimitOptions {
    requestPath: string;
    requestTimeWindow?: number;
    requestCount?: number;
    errorResponseMessage?: string;
    requestMethods?: (string[]);
    includeMasterKey?: boolean;
    includeInternalRequests?: boolean;
    redisUrl?: string;
    zone?: string;
}
export interface SecurityOptions {
    enableCheck?: boolean;
    enableCheckLog?: boolean;
    checkGroups?: (CheckGroup[]);
}
export interface PagesOptions {
    enableRouter?: boolean;
    enableLocalization?: boolean;
    localizationJsonPath?: string;
    localizationFallbackLocale?: string;
    placeholders?: any;
    forceRedirect?: boolean;
    pagesPath?: string;
    pagesEndpoint?: string;
    customUrls?: PagesCustomUrlsOptions;
    customRoutes?: (PagesRoute[]);
}
export interface PagesRoute {
    path: string;
    method: string;
    handler: () => void;
}
export interface PagesCustomUrlsOptions {
    passwordReset?: string;
    passwordResetLinkInvalid?: string;
    passwordResetSuccess?: string;
    emailVerificationSuccess?: string;
    emailVerificationSendFail?: string;
    emailVerificationSendSuccess?: string;
    emailVerificationLinkInvalid?: string;
    emailVerificationLinkExpired?: string;
}
export interface CustomPagesOptions {
    invalidLink?: string;
    linkSendFail?: string;
    choosePassword?: string;
    linkSendSuccess?: string;
    verifyEmailSuccess?: string;
    passwordResetSuccess?: string;
    invalidVerificationLink?: string;
    expiredVerificationLink?: string;
    invalidPasswordResetLink?: string;
    parseFrameURL?: string;
}
export interface LiveQueryOptions {
    classNames?: (string[]);
    redisOptions?: any;
    redisURL?: string;
    pubSubAdapter?: Adapter<PubSubAdapter>;
    wssAdapter?: Adapter<WSSAdapter>;
}
export interface LiveQueryServerOptions {
    appId?: string;
    masterKey?: string;
    serverURL?: string;
    keyPairs?: any;
    websocketTimeout?: number;
    cacheTimeout?: number;
    logLevel?: string;
    port?: number;
    redisOptions?: any;
    redisURL?: string;
    pubSubAdapter?: Adapter<PubSubAdapter>;
    wssAdapter?: Adapter<WSSAdapter>;
}
export interface IdempotencyOptions {
    paths?: (string[]);
    ttl?: number;
}
export interface AccountLockoutOptions {
    duration?: number;
    threshold?: number;
    unlockOnPasswordReset?: boolean;
}
export interface PasswordPolicyOptions {
    validatorPattern?: string;
    validatorCallback?: () => void;
    validationError?: string;
    doNotAllowUsername?: boolean;
    maxPasswordAge?: number;
    maxPasswordHistory?: number;
    resetTokenValidityDuration?: number;
    resetTokenReuseIfValid?: boolean;
    resetPasswordSuccessOnInvalidEmail?: boolean;
}
export interface FileUploadOptions {
    fileExtensions?: (string[]);
    enableForAnonymousUser?: boolean;
    enableForAuthenticatedUser?: boolean;
    enableForPublic?: boolean;
}
export interface DatabaseOptions {
    // Parse Server custom options
    allowPublicExplain?: boolean;
    createIndexRoleName?: boolean;
    createIndexUserEmail?: boolean;
    createIndexUserEmailCaseInsensitive?: boolean;
    createIndexUserEmailVerifyToken?: boolean;
    createIndexUserPasswordResetToken?: boolean;
    createIndexUserUsername?: boolean;
    createIndexUserUsernameCaseInsensitive?: boolean;
    disableIndexFieldValidation?: boolean;
    enableSchemaHooks?: boolean;
    logClientEvents?: any[];
    // maxTimeMS is a MongoDB option but Parse Server applies it per-operation, not as a global client option
    maxTimeMS?: number;
    schemaCacheTtl?: number;

    // MongoDB driver options
    appName?: string;
    authMechanism?: string;
    authMechanismProperties?: any;
    authSource?: string;
    autoSelectFamily?: boolean;
    autoSelectFamilyAttemptTimeout?: number;
    compressors?: string[] | string;
    connectTimeoutMS?: number;
    directConnection?: boolean;
    forceServerObjectId?: boolean;
    heartbeatFrequencyMS?: number;
    loadBalanced?: boolean;
    localThresholdMS?: number;
    maxConnecting?: number;
    maxIdleTimeMS?: number;
    maxPoolSize?: number;
    maxStalenessSeconds?: number;
    minPoolSize?: number;
    proxyHost?: string;
    proxyPassword?: string;
    proxyPort?: number;
    proxyUsername?: string;
    readConcernLevel?: string;
    readPreference?: string;
    readPreferenceTags?: any[];
    replicaSet?: string;
    retryReads?: boolean;
    retryWrites?: boolean;
    serverMonitoringMode?: string;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
    srvMaxHosts?: number;
    srvServiceName?: string;
    ssl?: boolean;
    tls?: boolean;
    tlsAllowInvalidCertificates?: boolean;
    tlsAllowInvalidHostnames?: boolean;
    tlsCAFile?: string;
    tlsCertificateKeyFile?: string;
    tlsCertificateKeyFilePassword?: string;
    tlsInsecure?: boolean;
    waitQueueTimeoutMS?: number;
    zlibCompressionLevel?: number;
}
export interface AuthAdapter {
    enabled?: boolean;
}
export interface LogLevels {
    triggerAfter?: string;
    triggerBeforeSuccess?: string;
    triggerBeforeError?: string;
    cloudFunctionSuccess?: string;
    cloudFunctionError?: string;
}
export {};
