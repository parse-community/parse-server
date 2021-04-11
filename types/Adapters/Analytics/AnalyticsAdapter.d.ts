export var __esModule: boolean;
export default _default;
/**
 * @module Adapters
 */
/**
 * @interface AnalyticsAdapter
 */
export class AnalyticsAdapter {
    /**
    @param {any} parameters: the analytics request body, analytics info will be in the dimensions property
    @param {Request} req: the original http request
     */
    appOpened(parameters: any, req: Request): Promise<{}>;
    /**
    @param {String} eventName: the name of the custom eventName
    @param {any} parameters: the analytics request body, analytics info will be in the dimensions property
    @param {Request} req: the original http request
     */
    trackEvent(eventName: string, parameters: any, req: Request): Promise<{}>;
}
declare var _default: typeof AnalyticsAdapter;
