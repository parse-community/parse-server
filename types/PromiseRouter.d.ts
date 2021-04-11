export var __esModule: boolean;
export default PromiseRouter;
declare class PromiseRouter {
    constructor(routes: any[], appId: any);
    routes: any[];
    appId: any;
    mountRoutes(): void;
    merge(router: any): void;
    route(method: any, path: any, ...handlers: any[]): void;
    match(method: any, path: any): {
        params: any;
        handler: any;
    };
    mountOnto(expressApp: any): any;
    expressRouter(): any;
    tryRouteRequest(method: any, path: any, request: any): Promise<any>;
}
