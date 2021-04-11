export = Config;
declare class Config {
    static get(applicationId: any, mount: any): Config;
    static put(serverConfiguration: any): any;
    static validate({ verifyUserEmails, userController, appName, publicServerURL, revokeSessionOnPasswordReset, expireInactiveSessions, sessionLength, maxLimit, emailVerifyTokenValidityDuration, accountLockout, passwordPolicy, masterKeyIps, masterKey, readOnlyMasterKey, allowHeaders, idempotencyOptions, emailVerifyTokenReuseIfValid, fileUpload, pages, security }: {
        verifyUserEmails: any;
        userController: any;
        appName: any;
        publicServerURL: any;
        revokeSessionOnPasswordReset: any;
        expireInactiveSessions: any;
        sessionLength: any;
        maxLimit: any;
        emailVerifyTokenValidityDuration: any;
        accountLockout: any;
        passwordPolicy: any;
        masterKeyIps: any;
        masterKey: any;
        readOnlyMasterKey: any;
        allowHeaders: any;
        idempotencyOptions: any;
        emailVerifyTokenReuseIfValid: any;
        fileUpload: any;
        pages: any;
        security: any;
    }): void;
    static validateSecurityOptions(security: any): void;
    static validatePagesOptions(pages: any): void;
    static validateIdempotencyOptions(idempotencyOptions: any): void;
    static validateAccountLockoutPolicy(accountLockout: any): void;
    static validatePasswordPolicy(passwordPolicy: any): void;
    static setupPasswordValidator(passwordPolicy: any): void;
    static validateEmailConfiguration({ emailAdapter, appName, publicServerURL, emailVerifyTokenValidityDuration, emailVerifyTokenReuseIfValid }: {
        emailAdapter: any;
        appName: any;
        publicServerURL: any;
        emailVerifyTokenValidityDuration: any;
        emailVerifyTokenReuseIfValid: any;
    }): void;
    static validateFileUploadOptions(fileUpload: any): void;
    static validateMasterKeyIps(masterKeyIps: any): void;
    static validateSessionConfiguration(sessionLength: any, expireInactiveSessions: any): void;
    static validateMaxLimit(maxLimit: any): void;
    static validateAllowHeaders(allowHeaders: any): void;
    set mount(arg: any);
    get mount(): any;
    _mount: any;
    generateEmailVerifyTokenExpiresAt(): Date;
    generatePasswordResetTokenExpiresAt(): Date;
    generateSessionExpiresAt(): Date;
    get invalidLinkURL(): any;
    get invalidVerificationLinkURL(): any;
    get linkSendSuccessURL(): any;
    get linkSendFailURL(): any;
    get verifyEmailSuccessURL(): any;
    get choosePasswordURL(): any;
    get requestResetPasswordURL(): string;
    get passwordResetSuccessURL(): any;
    get parseFrameURL(): any;
    get verifyEmailURL(): string;
    get pagesEndpoint(): any;
}
declare namespace Config {
    export { __esModule, Config, _default as default };
}
declare var __esModule: boolean;
declare var _default: typeof Config;
