export var __esModule: boolean;
export default _default;
declare const PushRouter_base: any;
export class PushRouter extends PushRouter_base {
    [x: string]: any;
    static handlePOST(req: any): Promise<any>;
    /**
     * Get query condition from the request body.
     * @param {Object} req A request object
     * @returns {Object} The query condition, the where field in a query api call
     */
    static getQueryCondition(req: any): any;
    mountRoutes(): void;
}
declare var _default: typeof PushRouter;
