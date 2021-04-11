export var __esModule: boolean;
export default _default;
export class PushController {
    /**
     * Get expiration time from the request body.
     * @param {Object} request A request object
     * @returns {Number|undefined} The expiration time if it exists in the request
     */
    static getExpirationTime(body?: {}): number | undefined;
    static getExpirationInterval(body?: {}): number;
    /**
     * Get push time from the request body.
     * @param {Object} request A request object
     * @returns {Number|undefined} The push time if it exists in the request
     */
    static getPushTime(body?: {}): number | undefined;
    /**
     * Checks if a ISO8601 formatted date contains a timezone component
     * @param pushTimeParam {string}
     * @returns {boolean}
     */
    static pushTimeHasTimezoneComponent(pushTimeParam: string): boolean;
    /**
     * Converts a date to ISO format in UTC time and strips the timezone if `isLocalTime` is true
     * @param date {Date}
     * @param isLocalTime {boolean}
     * @returns {string}
     */
    static formatPushTime({ date, isLocalTime }: Date): string;
    sendPush(body: {}, where: {}, config: any, auth: any, onPushStatusSaved?: () => void, now?: Date): Promise<any>;
}
declare var _default: typeof PushController;
