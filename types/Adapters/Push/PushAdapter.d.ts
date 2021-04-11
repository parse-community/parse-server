export var __esModule: boolean;
export default _default;
/**
 * @module Adapters
 */
/**
 * @interface PushAdapter
 */
export class PushAdapter {
    /**
     * @param {any} body
     * @param {Parse.Installation[]} installations
     * @param {any} pushStatus
     * @returns {Promise}
     */
    send(body: any, installations: any[], pushStatus: any): Promise<any>;
    /**
     * Get an array of valid push types.
     * @returns {Array} An array of valid push types
     */
    getValidPushTypes(): any[];
}
declare var _default: typeof PushAdapter;
