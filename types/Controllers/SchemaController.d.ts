export var __esModule: boolean;
export var SchemaController: typeof SchemaController;
export default SchemaController;
export function classNameIsValid(className: any): boolean;
export function fieldNameIsValid(fieldName: any, className: any): boolean;
export function invalidClassNameMessage(className: any): string;
export function buildMergedSchemaObject(existingFields: any, putRequest: any): {};
export const defaultColumns: Readonly<{
    _Default: {
        objectId: {
            type: string;
        };
        createdAt: {
            type: string;
        };
        updatedAt: {
            type: string;
        };
        ACL: {
            type: string;
        };
    };
    _User: {
        username: {
            type: string;
        };
        password: {
            type: string;
        };
        email: {
            type: string;
        };
        emailVerified: {
            type: string;
        };
        authData: {
            type: string;
        };
    };
    _Installation: {
        installationId: {
            type: string;
        };
        deviceToken: {
            type: string;
        };
        channels: {
            type: string;
        };
        deviceType: {
            type: string;
        };
        pushType: {
            type: string;
        };
        GCMSenderId: {
            type: string;
        };
        timeZone: {
            type: string;
        };
        localeIdentifier: {
            type: string;
        };
        badge: {
            type: string;
        };
        appVersion: {
            type: string;
        };
        appName: {
            type: string;
        };
        appIdentifier: {
            type: string;
        };
        parseVersion: {
            type: string;
        };
    };
    _Role: {
        name: {
            type: string;
        };
        users: {
            type: string;
            targetClass: string;
        };
        roles: {
            type: string;
            targetClass: string;
        };
    };
    _Session: {
        restricted: {
            type: string;
        };
        user: {
            type: string;
            targetClass: string;
        };
        installationId: {
            type: string;
        };
        sessionToken: {
            type: string;
        };
        expiresAt: {
            type: string;
        };
        createdWith: {
            type: string;
        };
    };
    _Product: {
        productIdentifier: {
            type: string;
        };
        download: {
            type: string;
        };
        downloadName: {
            type: string;
        };
        icon: {
            type: string;
        };
        order: {
            type: string;
        };
        title: {
            type: string;
        };
        subtitle: {
            type: string;
        };
    };
    _PushStatus: {
        pushTime: {
            type: string;
        };
        source: {
            type: string;
        };
        query: {
            type: string;
        };
        payload: {
            type: string;
        };
        title: {
            type: string;
        };
        expiry: {
            type: string;
        };
        expiration_interval: {
            type: string;
        };
        status: {
            type: string;
        };
        numSent: {
            type: string;
        };
        numFailed: {
            type: string;
        };
        pushHash: {
            type: string;
        };
        errorMessage: {
            type: string;
        };
        sentPerType: {
            type: string;
        };
        failedPerType: {
            type: string;
        };
        sentPerUTCOffset: {
            type: string;
        };
        failedPerUTCOffset: {
            type: string;
        };
        count: {
            type: string;
        };
    };
    _JobStatus: {
        jobName: {
            type: string;
        };
        source: {
            type: string;
        };
        status: {
            type: string;
        };
        message: {
            type: string;
        };
        params: {
            type: string;
        };
        finishedAt: {
            type: string;
        };
    };
    _JobSchedule: {
        jobName: {
            type: string;
        };
        description: {
            type: string;
        };
        params: {
            type: string;
        };
        startAfter: {
            type: string;
        };
        daysOfWeek: {
            type: string;
        };
        timeOfDay: {
            type: string;
        };
        lastRun: {
            type: string;
        };
        repeatMinutes: {
            type: string;
        };
    };
    _Hooks: {
        functionName: {
            type: string;
        };
        className: {
            type: string;
        };
        triggerName: {
            type: string;
        };
        url: {
            type: string;
        };
    };
    _GlobalConfig: {
        objectId: {
            type: string;
        };
        params: {
            type: string;
        };
        masterKeyOnly: {
            type: string;
        };
    };
    _GraphQLConfig: {
        objectId: {
            type: string;
        };
        config: {
            type: string;
        };
    };
    _Audience: {
        objectId: {
            type: string;
        };
        name: {
            type: string;
        };
        query: {
            type: string;
        };
        lastUsed: {
            type: string;
        };
        timesUsed: {
            type: string;
        };
    };
    _Idempotency: {
        reqId: {
            type: string;
        };
        expire: {
            type: string;
        };
    };
}>;
export const systemClasses: readonly string[];
export function convertSchemaToAdapterSchema(schema: any): any;
export const VolatileClassesSchemas: any[];
declare class SchemaController {
    static testPermissions(classPermissions: any, aclGroup: any, operation: any): boolean;
    static validatePermission(classPermissions: any, className: any, aclGroup: any, operation: any, action: any): true | Promise<void>;
    constructor(databaseAdapter: any);
    _dbAdapter: any;
    schemaData: SchemaData;
    protectedFields: any;
    userIdRegEx: RegExp;
    reloadData(options?: {
        clearCache: boolean;
    }): any;
    reloadDataPromise: any;
    getAllClasses(options?: {
        clearCache: boolean;
    }): any;
    setAllClasses(): any;
    getOneSchema(className: any, allowVolatileClasses?: boolean, options?: {
        clearCache: boolean;
    }): any;
    addClassIfNotExists(className: any, fields: {}, classLevelPermissions: any, indexes?: {}): Promise<any>;
    updateClass(className: any, submittedFields: any, classLevelPermissions: any, indexes: any, database: any): any;
    enforceClassExists(className: any): Promise<SchemaController>;
    validateNewClass(className: any, fields: {}, classLevelPermissions: any): {
        code: any;
        error: any;
    };
    validateSchemaData(className: any, fields: any, classLevelPermissions: any, existingFieldNames: any): {
        code: any;
        error: any;
    };
    setPermissions(className: any, perms: any, newSchema: any): Promise<void>;
    enforceFieldExists(className: any, fieldName: any, type: any): any;
    ensureFields(fields: any): void;
    deleteField(fieldName: any, className: any, database: any): any;
    deleteFields(fieldNames: any, className: any, database: any): any;
    validateObject(className: any, object: any, query: any): Promise<any>;
    validateRequiredColumns(className: any, object: any, query: any): Promise<SchemaController>;
    testPermissionsForClassName(className: any, aclGroup: any, operation: any): boolean;
    validatePermission(className: any, aclGroup: any, operation: any, action: any): true | Promise<void>;
    getClassLevelPermissions(className: any): any;
    getExpectedType(className: any, fieldName: any): any;
    hasClass(className: any): any;
}
export function load(dbAdapter: any, options: any): any;
declare class SchemaData {
    constructor(allSchemas?: any[], protectedFields?: {});
    __data: {};
    __protectedFields: {};
}
