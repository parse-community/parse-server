export var __esModule: boolean;
export default _default;
/**
 * @interface Page
 * Page
 * Page content that is returned by PageRouter.
 */
export class Page {
    /**
     * @description Creates a page.
     * @param {Object} params The page parameters.
     * @param {String} params.id The page identifier.
     * @param {String} params.defaultFile The page file name.
     * @returns {Page} The page.
     */
    constructor(params?: {
        id: string;
        defaultFile: string;
    });
    _id: string;
    _defaultFile: string;
    set id(arg: string);
    get id(): string;
    set defaultFile(arg: string);
    get defaultFile(): string;
}
declare var _default: typeof Page;
