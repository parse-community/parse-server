export var __esModule: boolean;
export default _default;
declare const UserController_base: any;
export class UserController extends UserController_base {
    [x: string]: any;
    constructor(adapter: any, appId: any, options?: {});
    get config(): any;
    validateAdapter(adapter: any): void;
    expectedAdapterType(): any;
    get shouldVerifyEmails(): any;
    setEmailVerifyToken(user: any): void;
    verifyEmail(username: any, token: any): any;
    checkResetTokenValidity(username: any, token: any): any;
    getUserIfNeeded(user: any): any;
    sendVerificationEmail(user: any): void;
    /**
     * Regenerates the given user's email verification token
     *
     * @param user
     * @returns {*}
     */
    regenerateEmailVerifyToken(user: any): any;
    resendVerificationEmail(username: any): any;
    setPasswordResetToken(email: any): any;
    sendPasswordResetEmail(email: any): Promise<any>;
    updatePassword(username: any, token: any, password: any): any;
    defaultVerificationEmail({ link, user, appName }: {
        link: any;
        user: any;
        appName: any;
    }): {
        text: string;
        to: any;
        subject: string;
    };
    defaultResetPasswordEmail({ link, user, appName }: {
        link: any;
        user: any;
        appName: any;
    }): {
        text: string;
        to: any;
        subject: string;
    };
}
declare var _default: typeof UserController;
