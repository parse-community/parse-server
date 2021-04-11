export var __esModule: boolean;
export default _default;
declare const UsersRouter_base: any;
export class UsersRouter extends UsersRouter_base {
    [x: string]: any;
    /**
     * Removes all "_" prefixed properties from an object, except "__type"
     * @param {Object} obj An object.
     */
    static removeHiddenProperties(obj: any): void;
    className(): string;
    /**
     * Validates a password request in login and verifyPassword
     * @param {Object} req The request
     * @returns {Object} User object
     * @private
     */
    private _authenticateUserFromRequest;
    handleMe(req: any): any;
    handleLogIn(req: any): Promise<{
        response: any;
    }>;
    handleVerifyPassword(req: any): any;
    handleLogOut(req: any): any;
    _runAfterLogoutTrigger(req: any, session: any): void;
    _throwOnBadEmailConfig(req: any): void;
    handleResetRequest(req: any): any;
    handleVerificationEmailRequest(req: any): any;
    mountRoutes(): void;
}
declare var _default: typeof UsersRouter;
