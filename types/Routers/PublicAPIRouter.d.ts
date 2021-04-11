export var __esModule: boolean;
export default _default;
declare const PublicAPIRouter_base: any;
export class PublicAPIRouter extends PublicAPIRouter_base {
    [x: string]: any;
    verifyEmail(req: any): any;
    resendVerificationEmail(req: any): any;
    changePassword(req: any): Promise<any>;
    requestResetPassword(req: any): any;
    resetPassword(req: any): any;
    invalidLink(req: any): Promise<{
        status: number;
        location: any;
    }>;
    invalidVerificationLink(req: any): Promise<{
        status: number;
        location: any;
    }>;
    missingPublicServerURL(): Promise<{
        text: string;
        status: number;
    }>;
    invalidRequest(): void;
    setConfig(req: any): Promise<void>;
    mountRoutes(): void;
    expressRouter(): any;
}
declare var _default: typeof PublicAPIRouter;
