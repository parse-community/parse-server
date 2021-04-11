export var __esModule: boolean;
export default _default;
declare const PagesRouter_base: any;
export class PagesRouter extends PagesRouter_base {
    [x: string]: any;
    /**
     * Constructs a PagesRouter.
     * @param {Object} pages The pages options from the Parse Server configuration.
     */
    constructor(pages?: any);
    pagesConfig: any;
    pagesEndpoint: any;
    pagesPath: any;
    verifyEmail(req: any): any;
    resendVerificationEmail(req: any): any;
    passwordReset(req: any): Promise<any>;
    requestResetPassword(req: any): any;
    resetPassword(req: any): any;
    /**
     * Returns page content if the page is a local file or returns a
     * redirect to a custom page.
     * @param {Object} req The express request.
     * @param {Page} page The page to go to.
     * @param {Object} [params={}] The query parameters to attach to the URL in case of
     * HTTP redirect responses for POST requests, or the placeholders to fill into
     * the response content in case of HTTP content responses for GET requests.
     * @param {Boolean} [responseType] Is true if a redirect response should be forced,
     * false if a content response should be forced, undefined if the response type
     * should depend on the request type by default:
     * - GET request -> content response
     * - POST request -> redirect response (PRG pattern)
     * @returns {Promise<Object>} The PromiseRouter response.
     */
    goToPage(req: any, page: any, params?: any, responseType?: boolean): Promise<any>;
    /**
     * Serves a request to a static resource and localizes the resource if it
     * is a HTML file.
     * @param {Object} req The request object.
     * @returns {Promise<Object>} The response.
     */
    staticRoute(req: any): Promise<any>;
    /**
     * Returns a translation from the JSON resource for a given locale. The JSON
     * resource is parsed according to i18next syntax.
     *
     * Example JSON content:
     * ```js
     *  {
     *    "en": {               // resource for language `en` (English)
     *      "translation": {
     *        "greeting": "Hello!"
     *      }
     *    },
     *    "de": {               // resource for language `de` (German)
     *      "translation": {
     *        "greeting": "Hallo!"
     *      }
     *    }
     *    "de-CH": {            // resource for locale `de-CH` (Swiss German)
     *      "translation": {
     *        "greeting": "Grüezi!"
     *      }
     *    }
     *  }
     * ```
     * @param {String} locale The locale to translate to.
     * @returns {Object} The translation or an empty object if no matching
     * translation was found.
     */
    getJsonTranslation(locale: string): any;
    /**
     * Returns a translation from the JSON resource for a given locale with
     * placeholders filled in by given parameters.
     * @param {String} locale The locale to translate to.
     * @param {Object} params The parameters to fill into any placeholders
     * within the translations.
     * @returns {Object} The translation or an empty object if no matching
     * translation was found.
     */
    getJsonPlaceholders(locale: string, params?: any): any;
    /**
     * Creates a response with file content.
     * @param {String} path The path of the file to return.
     * @param {Object} [params={}] The parameters to be included in the response
     * header. These will also be used to fill placeholders.
     * @param {Object} [placeholders={}] The placeholders to fill in the content.
     * These will not be included in the response header.
     * @returns {Object} The Promise Router response.
     */
    pageResponse(path: string, params?: any, placeholders?: any): any;
    /**
     * Creates a response with file content.
     * @param {String} path The path of the file to return.
     * @returns {Object} The PromiseRouter response.
     */
    fileResponse(path: string): any;
    /**
     * Reads and returns the content of a file at a given path. File reading to
     * serve content on the static route is only allowed from the pages
     * directory on downwards.
     * -----------------------------------------------------------------------
     * **WARNING:** All file reads in the PagesRouter must be executed by this
     * wrapper because it also detects and prevents common exploits.
     * -----------------------------------------------------------------------
     * @param {String} filePath The path to the file to read.
     * @returns {Promise<String>} The file content.
     */
    readFile(filePath: string): Promise<string>;
    /**
     * Loads a language resource JSON file that is used for translations.
     */
    loadJsonResource(): void;
    jsonParameters: any;
    /**
     * Extracts and returns the page default parameters from the Parse Server
     * configuration. These parameters are made accessible in every page served
     * by this router.
     * @param {Object} config The Parse Server configuration.
     * @returns {Object} The default parameters.
     */
    getDefaultParams(config: any): any;
    /**
     * Extracts and returns the locale from an express request.
     * @param {Object} req The express request.
     * @returns {String|undefined} The locale, or undefined if no locale was set.
     */
    getLocale(req: any): string | undefined;
    /**
     * Creates a response with http redirect.
     * @param {Object} req The express request.
     * @param {String} path The path of the file to return.
     * @param {Object} params The query parameters to include.
     * @returns {Object} The Promise Router response.
     */
    redirectResponse(url: any, params: any): any;
    defaultPagePath(file: any): any;
    composePageUrl(file: any, publicServerUrl: any, locale: any): any;
    notFound(): {
        text: string;
        status: number;
    };
    invalidRequest(): void;
    /**
     * Sets the Parse Server configuration in the request object to make it
     * easily accessible throughtout request processing.
     * @param {Object} req The request.
     * @param {Boolean} failGracefully Is true if failing to set the config should
     * not result in an invalid request response. Default is `false`.
     */
    setConfig(req: any, failGracefully?: boolean): Promise<void>;
    mountPagesRoutes(): void;
    mountCustomRoutes(): void;
    mountStaticRoute(): void;
    expressRouter(): any;
}
declare var _default: typeof PagesRouter;
export const pageParamHeaderPrefix: "x-parse-page-param-";
export const pageParams: Readonly<{
    appName: string;
    appId: string;
    token: string;
    username: string;
    error: string;
    locale: string;
    publicServerUrl: string;
}>;
export const pages: Readonly<{
    passwordReset: any;
    passwordResetSuccess: any;
    passwordResetLinkInvalid: any;
    emailVerificationSuccess: any;
    emailVerificationSendFail: any;
    emailVerificationSendSuccess: any;
    emailVerificationLinkInvalid: any;
    emailVerificationLinkExpired: any;
}>;
