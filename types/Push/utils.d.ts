export var __esModule: boolean;
export function isPushIncrementing(body: any): number | boolean;
export function getLocalesFromPush(body: any): any[];
export function transformPushBodyForLocale(body: any, locale: any): any;
export function stripLocalesFromBody(body: any): any;
export function bodiesPerLocales(body: any, locales?: any[]): any;
export function groupByLocaleIdentifier(installations: any, locales?: any[]): any;
/**
 * Check whether the deviceType parameter in qury condition is valid or not.
 * @param {Object} where A query condition
 * @param {Array} validPushTypes An array of valid push types(string)
 */
export function validatePushType(where?: any, validPushTypes?: any[]): void;
export function applyDeviceTokenExists(where: any): any;
