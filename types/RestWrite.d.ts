export = RestWrite;
declare function RestWrite(config: any, auth: any, className: any, query: any, data: any, originalData: any, clientSDK: any, context: any, action: any): void;
declare class RestWrite {
    constructor(config: any, auth: any, className: any, query: any, data: any, originalData: any, clientSDK: any, context: any, action: any);
    config: any;
    auth: any;
    className: any;
    clientSDK: any;
    storage: {};
    runOptions: {};
    context: any;
    response: {
        response: any;
        location: string;
        status?: undefined;
    } | {
        status: number;
        location: any;
        response: {
            sessionToken: string;
            user: {
                __type: string;
                className: string;
                objectId: any;
            };
            createdWith: any;
            restricted: boolean;
            expiresAt: any;
        };
    } | {
        response: any;
        location?: undefined;
        status?: undefined;
    } | {
        status: number;
        response: any;
        location: string;
    };
    query: any;
    data: any;
    originalData: any;
    updatedAt: any;
    validSchemaController: any;
    execute(): any;
    getUserAndRoleACL(): any;
    validateClientClassCreation(): any;
    validateSchema(): any;
    runBeforeSaveTrigger(): Promise<void>;
    runBeforeLoginTrigger(userData: any): Promise<void>;
    setRequiredFieldsIfNeeded(): any;
    validateAuthData(): Promise<any>;
    handleAuthDataValidation(authData: any): Promise<any[]>;
    findUsersWithAuthData(authData: any): Promise<any[]>;
    filteredObjectsByACL(objects: any): any;
    handleAuthData(authData: any): Promise<any>;
    transformUser(): Promise<any>;
    _validateUserName(): any;
    responseShouldHaveUsername: boolean;
    _validateEmail(): any;
    _validatePasswordPolicy(): any;
    _validatePasswordRequirements(): any;
    _validatePasswordHistory(): any;
    createSessionTokenIfNeeded(): Promise<any>;
    createSessionToken(): Promise<any>;
    deleteEmailResetTokenIfNeeded(): void;
    destroyDuplicatedSessions(): void;
    handleFollowup(): any;
    handleSession(): any;
    handleInstallation(): Promise<void>;
    expandFilesForExistingObjects(): void;
    runDatabaseOperation(): any;
    runAfterSaveTrigger(): Promise<void>;
    location(): string;
    objectId(): any;
    sanitizedData(): any;
    buildUpdatedObject(extraData: any): any;
    cleanUserAuthData(): void;
    _updateResponseWithData(response: any, data: any): any;
}
declare namespace RestWrite {
    export { createSession, __esModule, _default as default };
}
declare function createSession(config: any, { userId, createdWith, installationId, additionalSessionData }: {
    userId: any;
    createdWith: any;
    installationId: any;
    additionalSessionData: any;
}): {
    sessionData: {
        sessionToken: string;
        user: {
            __type: string;
            className: string;
            objectId: any;
        };
        createdWith: any;
        restricted: boolean;
        expiresAt: any;
    };
    createSession: () => any;
};
declare var __esModule: boolean;
declare var _default: typeof RestWrite;
