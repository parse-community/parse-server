export var __esModule: boolean;
declare const FunctionsRouter_base: any;
export class FunctionsRouter extends FunctionsRouter_base {
    [x: string]: any;
    static handleCloudJob(req: any): any;
    static createResponseObject(resolve: any, reject: any): {
        success: (result: any) => void;
        error: (message: any) => void;
    };
    static handleCloudFunction(req: any): Promise<any>;
    mountRoutes(): void;
}
export {};
