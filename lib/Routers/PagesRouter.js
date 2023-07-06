"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PagesRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var _Config = _interopRequireDefault(require("../Config"));
var _express = _interopRequireDefault(require("express"));
var _path = _interopRequireDefault(require("path"));
var _fs = require("fs");
var _node = require("parse/node");
var _Utils = _interopRequireDefault(require("../Utils"));
var _mustache = _interopRequireDefault(require("mustache"));
var _Page = _interopRequireDefault(require("../Page"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// All pages with custom page key for reference and file name
const pages = Object.freeze({
  passwordReset: new _Page.default({
    id: 'passwordReset',
    defaultFile: 'password_reset.html'
  }),
  passwordResetSuccess: new _Page.default({
    id: 'passwordResetSuccess',
    defaultFile: 'password_reset_success.html'
  }),
  passwordResetLinkInvalid: new _Page.default({
    id: 'passwordResetLinkInvalid',
    defaultFile: 'password_reset_link_invalid.html'
  }),
  emailVerificationSuccess: new _Page.default({
    id: 'emailVerificationSuccess',
    defaultFile: 'email_verification_success.html'
  }),
  emailVerificationSendFail: new _Page.default({
    id: 'emailVerificationSendFail',
    defaultFile: 'email_verification_send_fail.html'
  }),
  emailVerificationSendSuccess: new _Page.default({
    id: 'emailVerificationSendSuccess',
    defaultFile: 'email_verification_send_success.html'
  }),
  emailVerificationLinkInvalid: new _Page.default({
    id: 'emailVerificationLinkInvalid',
    defaultFile: 'email_verification_link_invalid.html'
  }),
  emailVerificationLinkExpired: new _Page.default({
    id: 'emailVerificationLinkExpired',
    defaultFile: 'email_verification_link_expired.html'
  })
});

// All page parameters for reference to be used as template placeholders or query params
const pageParams = Object.freeze({
  appName: 'appName',
  appId: 'appId',
  token: 'token',
  username: 'username',
  error: 'error',
  locale: 'locale',
  publicServerUrl: 'publicServerUrl'
});

// The header prefix to add page params as response headers
const pageParamHeaderPrefix = 'x-parse-page-param-';

// The errors being thrown
const errors = Object.freeze({
  jsonFailedFileLoading: 'failed to load JSON file',
  fileOutsideAllowedScope: 'not allowed to read file outside of pages directory'
});
class PagesRouter extends _PromiseRouter.default {
  /**
   * Constructs a PagesRouter.
   * @param {Object} pages The pages options from the Parse Server configuration.
   */
  constructor(pages = {}) {
    super();

    // Set instance properties
    this.pagesConfig = pages;
    this.pagesEndpoint = pages.pagesEndpoint ? pages.pagesEndpoint : 'apps';
    this.pagesPath = pages.pagesPath ? _path.default.resolve('./', pages.pagesPath) : _path.default.resolve(__dirname, '../../public');
    this.loadJsonResource();
    this.mountPagesRoutes();
    this.mountCustomRoutes();
    this.mountStaticRoute();
  }
  verifyEmail(req) {
    const config = req.config;
    const {
      username,
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!config) {
      this.invalidRequest();
    }
    if (!token || !username) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }
    const userController = config.userController;
    return userController.verifyEmail(username, token).then(() => {
      const params = {
        [pageParams.username]: username
      };
      return this.goToPage(req, pages.emailVerificationSuccess, params);
    }, () => {
      const params = {
        [pageParams.username]: username
      };
      return this.goToPage(req, pages.emailVerificationLinkExpired, params);
    });
  }
  resendVerificationEmail(req) {
    const config = req.config;
    const username = req.body.username;
    if (!config) {
      this.invalidRequest();
    }
    if (!username) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }
    const userController = config.userController;
    return userController.resendVerificationEmail(username, req).then(() => {
      return this.goToPage(req, pages.emailVerificationSendSuccess);
    }, () => {
      return this.goToPage(req, pages.emailVerificationSendFail);
    });
  }
  passwordReset(req) {
    const config = req.config;
    const params = {
      [pageParams.appId]: req.params.appId,
      [pageParams.appName]: config.appName,
      [pageParams.token]: req.query.token,
      [pageParams.username]: req.query.username,
      [pageParams.publicServerUrl]: config.publicServerURL
    };
    return this.goToPage(req, pages.passwordReset, params);
  }
  requestResetPassword(req) {
    const config = req.config;
    if (!config) {
      this.invalidRequest();
    }
    const {
      username,
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!username || !token) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }
    return config.userController.checkResetTokenValidity(username, token).then(() => {
      const params = {
        [pageParams.token]: token,
        [pageParams.username]: username,
        [pageParams.appId]: config.applicationId,
        [pageParams.appName]: config.appName
      };
      return this.goToPage(req, pages.passwordReset, params);
    }, () => {
      const params = {
        [pageParams.username]: username
      };
      return this.goToPage(req, pages.passwordResetLinkInvalid, params);
    });
  }
  resetPassword(req) {
    const config = req.config;
    if (!config) {
      this.invalidRequest();
    }
    const {
      username,
      new_password,
      token: rawToken
    } = req.body;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if ((!username || !token || !new_password) && req.xhr === false) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }
    if (!username) {
      throw new _node.Parse.Error(_node.Parse.Error.USERNAME_MISSING, 'Missing username');
    }
    if (!token) {
      throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, 'Missing token');
    }
    if (!new_password) {
      throw new _node.Parse.Error(_node.Parse.Error.PASSWORD_MISSING, 'Missing password');
    }
    return config.userController.updatePassword(username, token, new_password).then(() => {
      return Promise.resolve({
        success: true
      });
    }, err => {
      return Promise.resolve({
        success: false,
        err
      });
    }).then(result => {
      if (req.xhr) {
        if (result.success) {
          return Promise.resolve({
            status: 200,
            response: 'Password successfully reset'
          });
        }
        if (result.err) {
          throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, `${result.err}`);
        }
      }
      const query = result.success ? {
        [pageParams.username]: username
      } : {
        [pageParams.username]: username,
        [pageParams.token]: token,
        [pageParams.appId]: config.applicationId,
        [pageParams.error]: result.err,
        [pageParams.appName]: config.appName
      };
      const page = result.success ? pages.passwordResetSuccess : pages.passwordReset;
      return this.goToPage(req, page, query, false);
    });
  }

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
  goToPage(req, page, params = {}, responseType) {
    const config = req.config;

    // Determine redirect either by force, response setting or request method
    const redirect = config.pages.forceRedirect ? true : responseType !== undefined ? responseType : req.method == 'POST';

    // Include default parameters
    const defaultParams = this.getDefaultParams(config);
    if (Object.values(defaultParams).includes(undefined)) {
      return this.notFound();
    }
    params = Object.assign(params, defaultParams);

    // Add locale to params to ensure it is passed on with every request;
    // that means, once a locale is set, it is passed on to any follow-up page,
    // e.g. request_password_reset -> password_reset -> password_reset_success
    const locale = this.getLocale(req);
    params[pageParams.locale] = locale;

    // Compose paths and URLs
    const defaultFile = page.defaultFile;
    const defaultPath = this.defaultPagePath(defaultFile);
    const defaultUrl = this.composePageUrl(defaultFile, config.publicServerURL);

    // If custom URL is set redirect to it without localization
    const customUrl = config.pages.customUrls[page.id];
    if (customUrl && !_Utils.default.isPath(customUrl)) {
      return this.redirectResponse(customUrl, params);
    }

    // Get JSON placeholders
    let placeholders = {};
    if (config.pages.enableLocalization && config.pages.localizationJsonPath) {
      placeholders = this.getJsonPlaceholders(locale, params);
    }

    // Send response
    if (config.pages.enableLocalization && locale) {
      return _Utils.default.getLocalizedPath(defaultPath, locale).then(({
        path,
        subdir
      }) => redirect ? this.redirectResponse(this.composePageUrl(defaultFile, config.publicServerURL, subdir), params) : this.pageResponse(path, params, placeholders));
    } else {
      return redirect ? this.redirectResponse(defaultUrl, params) : this.pageResponse(defaultPath, params, placeholders);
    }
  }

  /**
   * Serves a request to a static resource and localizes the resource if it
   * is a HTML file.
   * @param {Object} req The request object.
   * @returns {Promise<Object>} The response.
   */
  staticRoute(req) {
    // Get requested path
    const relativePath = req.params[0];

    // Resolve requested path to absolute path
    const absolutePath = _path.default.resolve(this.pagesPath, relativePath);

    // If the requested file is not a HTML file send its raw content
    if (!absolutePath || !absolutePath.endsWith('.html')) {
      return this.fileResponse(absolutePath);
    }

    // Get parameters
    const params = this.getDefaultParams(req.config);
    const locale = this.getLocale(req);
    if (locale) {
      params.locale = locale;
    }

    // Get JSON placeholders
    const placeholders = this.getJsonPlaceholders(locale, params);
    return this.pageResponse(absolutePath, params, placeholders);
  }

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
  getJsonTranslation(locale) {
    // If there is no JSON resource
    if (this.jsonParameters === undefined) {
      return {};
    }

    // If locale is not set use the fallback locale
    locale = locale || this.pagesConfig.localizationFallbackLocale;

    // Get matching translation by locale, language or fallback locale
    const language = locale.split('-')[0];
    const resource = this.jsonParameters[locale] || this.jsonParameters[language] || this.jsonParameters[this.pagesConfig.localizationFallbackLocale] || {};
    const translation = resource.translation || {};
    return translation;
  }

  /**
   * Returns a translation from the JSON resource for a given locale with
   * placeholders filled in by given parameters.
   * @param {String} locale The locale to translate to.
   * @param {Object} params The parameters to fill into any placeholders
   * within the translations.
   * @returns {Object} The translation or an empty object if no matching
   * translation was found.
   */
  getJsonPlaceholders(locale, params = {}) {
    // If localization is disabled or there is no JSON resource
    if (!this.pagesConfig.enableLocalization || !this.pagesConfig.localizationJsonPath) {
      return {};
    }

    // Get JSON placeholders
    let placeholders = this.getJsonTranslation(locale);

    // Fill in any placeholders in the translation; this allows a translation
    // to contain default placeholders like {{appName}} which are filled here
    placeholders = JSON.stringify(placeholders);
    placeholders = _mustache.default.render(placeholders, params);
    placeholders = JSON.parse(placeholders);
    return placeholders;
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @param {Object} [params={}] The parameters to be included in the response
   * header. These will also be used to fill placeholders.
   * @param {Object} [placeholders={}] The placeholders to fill in the content.
   * These will not be included in the response header.
   * @returns {Object} The Promise Router response.
   */
  async pageResponse(path, params = {}, placeholders = {}) {
    // Get file content
    let data;
    try {
      data = await this.readFile(path);
    } catch (e) {
      return this.notFound();
    }

    // Get config placeholders; can be an object, a function or an async function
    let configPlaceholders = typeof this.pagesConfig.placeholders === 'function' ? this.pagesConfig.placeholders(params) : Object.prototype.toString.call(this.pagesConfig.placeholders) === '[object Object]' ? this.pagesConfig.placeholders : {};
    if (configPlaceholders instanceof Promise) {
      configPlaceholders = await configPlaceholders;
    }

    // Fill placeholders
    const allPlaceholders = Object.assign({}, configPlaceholders, placeholders);
    const paramsAndPlaceholders = Object.assign({}, params, allPlaceholders);
    data = _mustache.default.render(data, paramsAndPlaceholders);

    // Add placeholders in header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});
    return {
      text: data,
      headers: headers
    };
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @returns {Object} The PromiseRouter response.
   */
  async fileResponse(path) {
    // Get file content
    let data;
    try {
      data = await this.readFile(path);
    } catch (e) {
      return this.notFound();
    }
    return {
      text: data
    };
  }

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
  async readFile(filePath) {
    // Normalize path to prevent it from containing any directory changing
    // UNIX patterns which could expose the whole file system, e.g.
    // `http://example.com/parse/apps/../file.txt` requests a file outside
    // of the pages directory scope.
    const normalizedPath = _path.default.normalize(filePath);

    // Abort if the path is outside of the path directory scope
    if (!normalizedPath.startsWith(this.pagesPath)) {
      throw errors.fileOutsideAllowedScope;
    }
    return await _fs.promises.readFile(normalizedPath, 'utf-8');
  }

  /**
   * Loads a language resource JSON file that is used for translations.
   */
  loadJsonResource() {
    if (this.pagesConfig.localizationJsonPath === undefined) {
      return;
    }
    try {
      const json = require(_path.default.resolve('./', this.pagesConfig.localizationJsonPath));
      this.jsonParameters = json;
    } catch (e) {
      throw errors.jsonFailedFileLoading;
    }
  }

  /**
   * Extracts and returns the page default parameters from the Parse Server
   * configuration. These parameters are made accessible in every page served
   * by this router.
   * @param {Object} config The Parse Server configuration.
   * @returns {Object} The default parameters.
   */
  getDefaultParams(config) {
    return config ? {
      [pageParams.appId]: config.appId,
      [pageParams.appName]: config.appName,
      [pageParams.publicServerUrl]: config.publicServerURL
    } : {};
  }

  /**
   * Extracts and returns the locale from an express request.
   * @param {Object} req The express request.
   * @returns {String|undefined} The locale, or undefined if no locale was set.
   */
  getLocale(req) {
    const locale = (req.query || {})[pageParams.locale] || (req.body || {})[pageParams.locale] || (req.params || {})[pageParams.locale] || (req.headers || {})[pageParamHeaderPrefix + pageParams.locale];
    return locale;
  }

  /**
   * Creates a response with http redirect.
   * @param {Object} req The express request.
   * @param {String} path The path of the file to return.
   * @param {Object} params The query parameters to include.
   * @returns {Object} The Promise Router response.
   */
  async redirectResponse(url, params) {
    // Remove any parameters with undefined value
    params = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[p[0]] = p[1];
      }
      return m;
    }, {});

    // Compose URL with parameters in query
    const location = new URL(url);
    Object.entries(params).forEach(p => location.searchParams.set(p[0], p[1]));
    const locationString = location.toString();

    // Add parameters to header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});
    return {
      status: 303,
      location: locationString,
      headers: headers
    };
  }
  defaultPagePath(file) {
    return _path.default.join(this.pagesPath, file);
  }
  composePageUrl(file, publicServerUrl, locale) {
    let url = publicServerUrl;
    url += url.endsWith('/') ? '' : '/';
    url += this.pagesEndpoint + '/';
    url += locale === undefined ? '' : locale + '/';
    url += file;
    return url;
  }
  notFound() {
    return {
      text: 'Not found.',
      status: 404
    };
  }
  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }

  /**
   * Sets the Parse Server configuration in the request object to make it
   * easily accessible throughtout request processing.
   * @param {Object} req The request.
   * @param {Boolean} failGracefully Is true if failing to set the config should
   * not result in an invalid request response. Default is `false`.
   */
  setConfig(req, failGracefully = false) {
    req.config = _Config.default.get(req.params.appId || req.query.appId);
    if (!req.config && !failGracefully) {
      this.invalidRequest();
    }
    return Promise.resolve();
  }
  mountPagesRoutes() {
    this.route('GET', `/${this.pagesEndpoint}/:appId/verify_email`, req => {
      this.setConfig(req);
    }, req => {
      return this.verifyEmail(req);
    });
    this.route('POST', `/${this.pagesEndpoint}/:appId/resend_verification_email`, req => {
      this.setConfig(req);
    }, req => {
      return this.resendVerificationEmail(req);
    });
    this.route('GET', `/${this.pagesEndpoint}/choose_password`, req => {
      this.setConfig(req);
    }, req => {
      return this.passwordReset(req);
    });
    this.route('POST', `/${this.pagesEndpoint}/:appId/request_password_reset`, req => {
      this.setConfig(req);
    }, req => {
      return this.resetPassword(req);
    });
    this.route('GET', `/${this.pagesEndpoint}/:appId/request_password_reset`, req => {
      this.setConfig(req);
    }, req => {
      return this.requestResetPassword(req);
    });
  }
  mountCustomRoutes() {
    for (const route of this.pagesConfig.customRoutes || []) {
      this.route(route.method, `/${this.pagesEndpoint}/:appId/${route.path}`, req => {
        this.setConfig(req);
      }, async req => {
        const {
          file,
          query = {}
        } = (await route.handler(req)) || {};

        // If route handler did not return a page send 404 response
        if (!file) {
          return this.notFound();
        }

        // Send page response
        const page = new _Page.default({
          id: file,
          defaultFile: file
        });
        return this.goToPage(req, page, query, false);
      });
    }
  }
  mountStaticRoute() {
    this.route('GET', `/${this.pagesEndpoint}/(*)?`, req => {
      this.setConfig(req, true);
    }, req => {
      return this.staticRoute(req);
    });
  }
  expressRouter() {
    const router = _express.default.Router();
    router.use('/', super.expressRouter());
    return router;
  }
}
exports.PagesRouter = PagesRouter;
var _default = PagesRouter;
exports.default = _default;
module.exports = {
  PagesRouter,
  pageParamHeaderPrefix,
  pageParams,
  pages
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYWdlcyIsIk9iamVjdCIsImZyZWV6ZSIsInBhc3N3b3JkUmVzZXQiLCJQYWdlIiwiaWQiLCJkZWZhdWx0RmlsZSIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFzc3dvcmRSZXNldExpbmtJbnZhbGlkIiwiZW1haWxWZXJpZmljYXRpb25TdWNjZXNzIiwiZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCIsImVtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3MiLCJlbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkIiwiZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCIsInBhZ2VQYXJhbXMiLCJhcHBOYW1lIiwiYXBwSWQiLCJ0b2tlbiIsInVzZXJuYW1lIiwiZXJyb3IiLCJsb2NhbGUiLCJwdWJsaWNTZXJ2ZXJVcmwiLCJwYWdlUGFyYW1IZWFkZXJQcmVmaXgiLCJlcnJvcnMiLCJqc29uRmFpbGVkRmlsZUxvYWRpbmciLCJmaWxlT3V0c2lkZUFsbG93ZWRTY29wZSIsIlBhZ2VzUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImNvbnN0cnVjdG9yIiwicGFnZXNDb25maWciLCJwYWdlc0VuZHBvaW50IiwicGFnZXNQYXRoIiwicGF0aCIsInJlc29sdmUiLCJfX2Rpcm5hbWUiLCJsb2FkSnNvblJlc291cmNlIiwibW91bnRQYWdlc1JvdXRlcyIsIm1vdW50Q3VzdG9tUm91dGVzIiwibW91bnRTdGF0aWNSb3V0ZSIsInZlcmlmeUVtYWlsIiwicmVxIiwiY29uZmlnIiwicmF3VG9rZW4iLCJxdWVyeSIsInRvU3RyaW5nIiwiaW52YWxpZFJlcXVlc3QiLCJnb1RvUGFnZSIsInVzZXJDb250cm9sbGVyIiwidGhlbiIsInBhcmFtcyIsInJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiYm9keSIsInB1YmxpY1NlcnZlclVSTCIsInJlcXVlc3RSZXNldFBhc3N3b3JkIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJhcHBsaWNhdGlvbklkIiwicmVzZXRQYXNzd29yZCIsIm5ld19wYXNzd29yZCIsInhociIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiT1RIRVJfQ0FVU0UiLCJQQVNTV09SRF9NSVNTSU5HIiwidXBkYXRlUGFzc3dvcmQiLCJQcm9taXNlIiwic3VjY2VzcyIsImVyciIsInJlc3VsdCIsInN0YXR1cyIsInJlc3BvbnNlIiwicGFnZSIsInJlc3BvbnNlVHlwZSIsInJlZGlyZWN0IiwiZm9yY2VSZWRpcmVjdCIsInVuZGVmaW5lZCIsIm1ldGhvZCIsImRlZmF1bHRQYXJhbXMiLCJnZXREZWZhdWx0UGFyYW1zIiwidmFsdWVzIiwiaW5jbHVkZXMiLCJub3RGb3VuZCIsImFzc2lnbiIsImdldExvY2FsZSIsImRlZmF1bHRQYXRoIiwiZGVmYXVsdFBhZ2VQYXRoIiwiZGVmYXVsdFVybCIsImNvbXBvc2VQYWdlVXJsIiwiY3VzdG9tVXJsIiwiY3VzdG9tVXJscyIsIlV0aWxzIiwiaXNQYXRoIiwicmVkaXJlY3RSZXNwb25zZSIsInBsYWNlaG9sZGVycyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiZ2V0SnNvblBsYWNlaG9sZGVycyIsImdldExvY2FsaXplZFBhdGgiLCJzdWJkaXIiLCJwYWdlUmVzcG9uc2UiLCJzdGF0aWNSb3V0ZSIsInJlbGF0aXZlUGF0aCIsImFic29sdXRlUGF0aCIsImVuZHNXaXRoIiwiZmlsZVJlc3BvbnNlIiwiZ2V0SnNvblRyYW5zbGF0aW9uIiwianNvblBhcmFtZXRlcnMiLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsImxhbmd1YWdlIiwic3BsaXQiLCJyZXNvdXJjZSIsInRyYW5zbGF0aW9uIiwiSlNPTiIsInN0cmluZ2lmeSIsIm11c3RhY2hlIiwicmVuZGVyIiwicGFyc2UiLCJkYXRhIiwicmVhZEZpbGUiLCJlIiwiY29uZmlnUGxhY2Vob2xkZXJzIiwicHJvdG90eXBlIiwiY2FsbCIsImFsbFBsYWNlaG9sZGVycyIsInBhcmFtc0FuZFBsYWNlaG9sZGVycyIsImhlYWRlcnMiLCJlbnRyaWVzIiwicmVkdWNlIiwibSIsInAiLCJ0b0xvd2VyQ2FzZSIsInRleHQiLCJmaWxlUGF0aCIsIm5vcm1hbGl6ZWRQYXRoIiwibm9ybWFsaXplIiwic3RhcnRzV2l0aCIsImZzIiwianNvbiIsInJlcXVpcmUiLCJ1cmwiLCJsb2NhdGlvbiIsIlVSTCIsImZvckVhY2giLCJzZWFyY2hQYXJhbXMiLCJzZXQiLCJsb2NhdGlvblN0cmluZyIsImZpbGUiLCJqb2luIiwibWVzc2FnZSIsInNldENvbmZpZyIsImZhaWxHcmFjZWZ1bGx5IiwiQ29uZmlnIiwiZ2V0Iiwicm91dGUiLCJjdXN0b21Sb3V0ZXMiLCJoYW5kbGVyIiwiZXhwcmVzc1JvdXRlciIsInJvdXRlciIsImV4cHJlc3MiLCJSb3V0ZXIiLCJ1c2UiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvUGFnZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzZXMgYXMgZnMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCBtdXN0YWNoZSBmcm9tICdtdXN0YWNoZSc7XG5pbXBvcnQgUGFnZSBmcm9tICcuLi9QYWdlJztcblxuLy8gQWxsIHBhZ2VzIHdpdGggY3VzdG9tIHBhZ2Uga2V5IGZvciByZWZlcmVuY2UgYW5kIGZpbGUgbmFtZVxuY29uc3QgcGFnZXMgPSBPYmplY3QuZnJlZXplKHtcbiAgcGFzc3dvcmRSZXNldDogbmV3IFBhZ2UoeyBpZDogJ3Bhc3N3b3JkUmVzZXQnLCBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0Lmh0bWwnIH0pLFxuICBwYXNzd29yZFJlc2V0U3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAncGFzc3dvcmRSZXNldFN1Y2Nlc3MnLFxuICAgIGRlZmF1bHRGaWxlOiAncGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIHBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAncGFzc3dvcmRSZXNldExpbmtJbnZhbGlkJyxcbiAgICBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0X2xpbmtfaW52YWxpZC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TdWNjZXNzJyxcbiAgICBkZWZhdWx0RmlsZTogJ2VtYWlsX3ZlcmlmaWNhdGlvbl9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc2VuZF9mYWlsLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzcycsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc2VuZF9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fbGlua19pbnZhbGlkLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fbGlua19leHBpcmVkLmh0bWwnLFxuICB9KSxcbn0pO1xuXG4vLyBBbGwgcGFnZSBwYXJhbWV0ZXJzIGZvciByZWZlcmVuY2UgdG8gYmUgdXNlZCBhcyB0ZW1wbGF0ZSBwbGFjZWhvbGRlcnMgb3IgcXVlcnkgcGFyYW1zXG5jb25zdCBwYWdlUGFyYW1zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGFwcE5hbWU6ICdhcHBOYW1lJyxcbiAgYXBwSWQ6ICdhcHBJZCcsXG4gIHRva2VuOiAndG9rZW4nLFxuICB1c2VybmFtZTogJ3VzZXJuYW1lJyxcbiAgZXJyb3I6ICdlcnJvcicsXG4gIGxvY2FsZTogJ2xvY2FsZScsXG4gIHB1YmxpY1NlcnZlclVybDogJ3B1YmxpY1NlcnZlclVybCcsXG59KTtcblxuLy8gVGhlIGhlYWRlciBwcmVmaXggdG8gYWRkIHBhZ2UgcGFyYW1zIGFzIHJlc3BvbnNlIGhlYWRlcnNcbmNvbnN0IHBhZ2VQYXJhbUhlYWRlclByZWZpeCA9ICd4LXBhcnNlLXBhZ2UtcGFyYW0tJztcblxuLy8gVGhlIGVycm9ycyBiZWluZyB0aHJvd25cbmNvbnN0IGVycm9ycyA9IE9iamVjdC5mcmVlemUoe1xuICBqc29uRmFpbGVkRmlsZUxvYWRpbmc6ICdmYWlsZWQgdG8gbG9hZCBKU09OIGZpbGUnLFxuICBmaWxlT3V0c2lkZUFsbG93ZWRTY29wZTogJ25vdCBhbGxvd2VkIHRvIHJlYWQgZmlsZSBvdXRzaWRlIG9mIHBhZ2VzIGRpcmVjdG9yeScsXG59KTtcblxuZXhwb3J0IGNsYXNzIFBhZ2VzUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIC8qKlxuICAgKiBDb25zdHJ1Y3RzIGEgUGFnZXNSb3V0ZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYWdlcyBUaGUgcGFnZXMgb3B0aW9ucyBmcm9tIHRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHBhZ2VzID0ge30pIHtcbiAgICBzdXBlcigpO1xuXG4gICAgLy8gU2V0IGluc3RhbmNlIHByb3BlcnRpZXNcbiAgICB0aGlzLnBhZ2VzQ29uZmlnID0gcGFnZXM7XG4gICAgdGhpcy5wYWdlc0VuZHBvaW50ID0gcGFnZXMucGFnZXNFbmRwb2ludCA/IHBhZ2VzLnBhZ2VzRW5kcG9pbnQgOiAnYXBwcyc7XG4gICAgdGhpcy5wYWdlc1BhdGggPSBwYWdlcy5wYWdlc1BhdGhcbiAgICAgID8gcGF0aC5yZXNvbHZlKCcuLycsIHBhZ2VzLnBhZ2VzUGF0aClcbiAgICAgIDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3B1YmxpYycpO1xuICAgIHRoaXMubG9hZEpzb25SZXNvdXJjZSgpO1xuICAgIHRoaXMubW91bnRQYWdlc1JvdXRlcygpO1xuICAgIHRoaXMubW91bnRDdXN0b21Sb3V0ZXMoKTtcbiAgICB0aGlzLm1vdW50U3RhdGljUm91dGUoKTtcbiAgfVxuXG4gIHZlcmlmeUVtYWlsKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgeyB1c2VybmFtZSwgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEucXVlcnk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuIHx8ICF1c2VybmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIudmVyaWZ5RW1haWwodXNlcm5hbWUsIHRva2VuKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3MsIHBhcmFtcyk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvbkxpbmtFeHBpcmVkLCBwYXJhbXMpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICByZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHVzZXJuYW1lID0gcmVxLmJvZHkudXNlcm5hbWU7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIucmVzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcm5hbWUsIHJlcSkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHBhc3N3b3JkUmVzZXQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IHJlcS5wYXJhbXMuYXBwSWQsXG4gICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHJlcS5xdWVyeS50b2tlbixcbiAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogcmVxLnF1ZXJ5LnVzZXJuYW1lLFxuICAgICAgW3BhZ2VQYXJhbXMucHVibGljU2VydmVyVXJsXTogY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldCwgcGFyYW1zKTtcbiAgfVxuXG4gIHJlcXVlc3RSZXNldFBhc3N3b3JkKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHsgdXNlcm5hbWUsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghdXNlcm5hbWUgfHwgIXRva2VuKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbmZpZy51c2VyQ29udHJvbGxlci5jaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh1c2VybmFtZSwgdG9rZW4pLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHRva2VuLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwbGljYXRpb25JZCxcbiAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldCwgcGFyYW1zKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCwgcGFyYW1zKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgcmVzZXRQYXNzd29yZChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHVzZXJuYW1lLCBuZXdfcGFzc3dvcmQsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLmJvZHk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCghdXNlcm5hbWUgfHwgIXRva2VuIHx8ICFuZXdfcGFzc3dvcmQpICYmIHJlcS54aHIgPT09IGZhbHNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICdNaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuXG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTWlzc2luZyB0b2tlbicpO1xuICAgIH1cblxuICAgIGlmICghbmV3X3Bhc3N3b3JkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ01pc3NpbmcgcGFzc3dvcmQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29uZmlnLnVzZXJDb250cm9sbGVyXG4gICAgICAudXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBuZXdfcGFzc3dvcmQpXG4gICAgICAudGhlbihcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZXJyLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVxLnhocikge1xuICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICAgIHN0YXR1czogMjAwLFxuICAgICAgICAgICAgICByZXNwb25zZTogJ1Bhc3N3b3JkIHN1Y2Nlc3NmdWxseSByZXNldCcsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlc3VsdC5lcnIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYCR7cmVzdWx0LmVycn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBxdWVyeSA9IHJlc3VsdC5zdWNjZXNzXG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICAgIH1cbiAgICAgICAgICA6IHtcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHRva2VuLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwbGljYXRpb25JZCxcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLmVycm9yXTogcmVzdWx0LmVycixcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICBjb25zdCBwYWdlID0gcmVzdWx0LnN1Y2Nlc3MgPyBwYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyA6IHBhZ2VzLnBhc3N3b3JkUmVzZXQ7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlLCBxdWVyeSwgZmFsc2UpO1xuICAgICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBwYWdlIGNvbnRlbnQgaWYgdGhlIHBhZ2UgaXMgYSBsb2NhbCBmaWxlIG9yIHJldHVybnMgYVxuICAgKiByZWRpcmVjdCB0byBhIGN1c3RvbSBwYWdlLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSBleHByZXNzIHJlcXVlc3QuXG4gICAqIEBwYXJhbSB7UGFnZX0gcGFnZSBUaGUgcGFnZSB0byBnbyB0by5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtwYXJhbXM9e31dIFRoZSBxdWVyeSBwYXJhbWV0ZXJzIHRvIGF0dGFjaCB0byB0aGUgVVJMIGluIGNhc2Ugb2ZcbiAgICogSFRUUCByZWRpcmVjdCByZXNwb25zZXMgZm9yIFBPU1QgcmVxdWVzdHMsIG9yIHRoZSBwbGFjZWhvbGRlcnMgdG8gZmlsbCBpbnRvXG4gICAqIHRoZSByZXNwb25zZSBjb250ZW50IGluIGNhc2Ugb2YgSFRUUCBjb250ZW50IHJlc3BvbnNlcyBmb3IgR0VUIHJlcXVlc3RzLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtyZXNwb25zZVR5cGVdIElzIHRydWUgaWYgYSByZWRpcmVjdCByZXNwb25zZSBzaG91bGQgYmUgZm9yY2VkLFxuICAgKiBmYWxzZSBpZiBhIGNvbnRlbnQgcmVzcG9uc2Ugc2hvdWxkIGJlIGZvcmNlZCwgdW5kZWZpbmVkIGlmIHRoZSByZXNwb25zZSB0eXBlXG4gICAqIHNob3VsZCBkZXBlbmQgb24gdGhlIHJlcXVlc3QgdHlwZSBieSBkZWZhdWx0OlxuICAgKiAtIEdFVCByZXF1ZXN0IC0+IGNvbnRlbnQgcmVzcG9uc2VcbiAgICogLSBQT1NUIHJlcXVlc3QgLT4gcmVkaXJlY3QgcmVzcG9uc2UgKFBSRyBwYXR0ZXJuKVxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBUaGUgUHJvbWlzZVJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGdvVG9QYWdlKHJlcSwgcGFnZSwgcGFyYW1zID0ge30sIHJlc3BvbnNlVHlwZSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG5cbiAgICAvLyBEZXRlcm1pbmUgcmVkaXJlY3QgZWl0aGVyIGJ5IGZvcmNlLCByZXNwb25zZSBzZXR0aW5nIG9yIHJlcXVlc3QgbWV0aG9kXG4gICAgY29uc3QgcmVkaXJlY3QgPSBjb25maWcucGFnZXMuZm9yY2VSZWRpcmVjdFxuICAgICAgPyB0cnVlXG4gICAgICA6IHJlc3BvbnNlVHlwZSAhPT0gdW5kZWZpbmVkXG4gICAgICAgID8gcmVzcG9uc2VUeXBlXG4gICAgICAgIDogcmVxLm1ldGhvZCA9PSAnUE9TVCc7XG5cbiAgICAvLyBJbmNsdWRlIGRlZmF1bHQgcGFyYW1ldGVyc1xuICAgIGNvbnN0IGRlZmF1bHRQYXJhbXMgPSB0aGlzLmdldERlZmF1bHRQYXJhbXMoY29uZmlnKTtcbiAgICBpZiAoT2JqZWN0LnZhbHVlcyhkZWZhdWx0UGFyYW1zKS5pbmNsdWRlcyh1bmRlZmluZWQpKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZCgpO1xuICAgIH1cbiAgICBwYXJhbXMgPSBPYmplY3QuYXNzaWduKHBhcmFtcywgZGVmYXVsdFBhcmFtcyk7XG5cbiAgICAvLyBBZGQgbG9jYWxlIHRvIHBhcmFtcyB0byBlbnN1cmUgaXQgaXMgcGFzc2VkIG9uIHdpdGggZXZlcnkgcmVxdWVzdDtcbiAgICAvLyB0aGF0IG1lYW5zLCBvbmNlIGEgbG9jYWxlIGlzIHNldCwgaXQgaXMgcGFzc2VkIG9uIHRvIGFueSBmb2xsb3ctdXAgcGFnZSxcbiAgICAvLyBlLmcuIHJlcXVlc3RfcGFzc3dvcmRfcmVzZXQgLT4gcGFzc3dvcmRfcmVzZXQgLT4gcGFzc3dvcmRfcmVzZXRfc3VjY2Vzc1xuICAgIGNvbnN0IGxvY2FsZSA9IHRoaXMuZ2V0TG9jYWxlKHJlcSk7XG4gICAgcGFyYW1zW3BhZ2VQYXJhbXMubG9jYWxlXSA9IGxvY2FsZTtcblxuICAgIC8vIENvbXBvc2UgcGF0aHMgYW5kIFVSTHNcbiAgICBjb25zdCBkZWZhdWx0RmlsZSA9IHBhZ2UuZGVmYXVsdEZpbGU7XG4gICAgY29uc3QgZGVmYXVsdFBhdGggPSB0aGlzLmRlZmF1bHRQYWdlUGF0aChkZWZhdWx0RmlsZSk7XG4gICAgY29uc3QgZGVmYXVsdFVybCA9IHRoaXMuY29tcG9zZVBhZ2VVcmwoZGVmYXVsdEZpbGUsIGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwpO1xuXG4gICAgLy8gSWYgY3VzdG9tIFVSTCBpcyBzZXQgcmVkaXJlY3QgdG8gaXQgd2l0aG91dCBsb2NhbGl6YXRpb25cbiAgICBjb25zdCBjdXN0b21VcmwgPSBjb25maWcucGFnZXMuY3VzdG9tVXJsc1twYWdlLmlkXTtcbiAgICBpZiAoY3VzdG9tVXJsICYmICFVdGlscy5pc1BhdGgoY3VzdG9tVXJsKSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RSZXNwb25zZShjdXN0b21VcmwsIHBhcmFtcyk7XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgbGV0IHBsYWNlaG9sZGVycyA9IHt9O1xuICAgIGlmIChjb25maWcucGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uICYmIGNvbmZpZy5wYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkge1xuICAgICAgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zKTtcbiAgICB9XG5cbiAgICAvLyBTZW5kIHJlc3BvbnNlXG4gICAgaWYgKGNvbmZpZy5wYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gJiYgbG9jYWxlKSB7XG4gICAgICByZXR1cm4gVXRpbHMuZ2V0TG9jYWxpemVkUGF0aChkZWZhdWx0UGF0aCwgbG9jYWxlKS50aGVuKCh7IHBhdGgsIHN1YmRpciB9KSA9PlxuICAgICAgICByZWRpcmVjdFxuICAgICAgICAgID8gdGhpcy5yZWRpcmVjdFJlc3BvbnNlKFxuICAgICAgICAgICAgdGhpcy5jb21wb3NlUGFnZVVybChkZWZhdWx0RmlsZSwgY29uZmlnLnB1YmxpY1NlcnZlclVSTCwgc3ViZGlyKSxcbiAgICAgICAgICAgIHBhcmFtc1xuICAgICAgICAgIClcbiAgICAgICAgICA6IHRoaXMucGFnZVJlc3BvbnNlKHBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHJlZGlyZWN0XG4gICAgICAgID8gdGhpcy5yZWRpcmVjdFJlc3BvbnNlKGRlZmF1bHRVcmwsIHBhcmFtcylcbiAgICAgICAgOiB0aGlzLnBhZ2VSZXNwb25zZShkZWZhdWx0UGF0aCwgcGFyYW1zLCBwbGFjZWhvbGRlcnMpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZXJ2ZXMgYSByZXF1ZXN0IHRvIGEgc3RhdGljIHJlc291cmNlIGFuZCBsb2NhbGl6ZXMgdGhlIHJlc291cmNlIGlmIGl0XG4gICAqIGlzIGEgSFRNTCBmaWxlLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIHJlc3BvbnNlLlxuICAgKi9cbiAgc3RhdGljUm91dGUocmVxKSB7XG4gICAgLy8gR2V0IHJlcXVlc3RlZCBwYXRoXG4gICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcmVxLnBhcmFtc1swXTtcblxuICAgIC8vIFJlc29sdmUgcmVxdWVzdGVkIHBhdGggdG8gYWJzb2x1dGUgcGF0aFxuICAgIGNvbnN0IGFic29sdXRlUGF0aCA9IHBhdGgucmVzb2x2ZSh0aGlzLnBhZ2VzUGF0aCwgcmVsYXRpdmVQYXRoKTtcblxuICAgIC8vIElmIHRoZSByZXF1ZXN0ZWQgZmlsZSBpcyBub3QgYSBIVE1MIGZpbGUgc2VuZCBpdHMgcmF3IGNvbnRlbnRcbiAgICBpZiAoIWFic29sdXRlUGF0aCB8fCAhYWJzb2x1dGVQYXRoLmVuZHNXaXRoKCcuaHRtbCcpKSB7XG4gICAgICByZXR1cm4gdGhpcy5maWxlUmVzcG9uc2UoYWJzb2x1dGVQYXRoKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgcGFyYW1ldGVyc1xuICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMuZ2V0RGVmYXVsdFBhcmFtcyhyZXEuY29uZmlnKTtcbiAgICBjb25zdCBsb2NhbGUgPSB0aGlzLmdldExvY2FsZShyZXEpO1xuICAgIGlmIChsb2NhbGUpIHtcbiAgICAgIHBhcmFtcy5sb2NhbGUgPSBsb2NhbGU7XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgY29uc3QgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zKTtcblxuICAgIHJldHVybiB0aGlzLnBhZ2VSZXNwb25zZShhYnNvbHV0ZVBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgdHJhbnNsYXRpb24gZnJvbSB0aGUgSlNPTiByZXNvdXJjZSBmb3IgYSBnaXZlbiBsb2NhbGUuIFRoZSBKU09OXG4gICAqIHJlc291cmNlIGlzIHBhcnNlZCBhY2NvcmRpbmcgdG8gaTE4bmV4dCBzeW50YXguXG4gICAqXG4gICAqIEV4YW1wbGUgSlNPTiBjb250ZW50OlxuICAgKiBgYGBqc1xuICAgKiAge1xuICAgKiAgICBcImVuXCI6IHsgICAgICAgICAgICAgICAvLyByZXNvdXJjZSBmb3IgbGFuZ3VhZ2UgYGVuYCAoRW5nbGlzaClcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJIZWxsbyFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfSxcbiAgICogICAgXCJkZVwiOiB7ICAgICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxhbmd1YWdlIGBkZWAgKEdlcm1hbilcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJIYWxsbyFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfVxuICAgKiAgICBcImRlLUNIXCI6IHsgICAgICAgICAgICAvLyByZXNvdXJjZSBmb3IgbG9jYWxlIGBkZS1DSGAgKFN3aXNzIEdlcm1hbilcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJHcsO8ZXppIVwiXG4gICAqICAgICAgfVxuICAgKiAgICB9XG4gICAqICB9XG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUgdG8gdHJhbnNsYXRlIHRvLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgdHJhbnNsYXRpb24gb3IgYW4gZW1wdHkgb2JqZWN0IGlmIG5vIG1hdGNoaW5nXG4gICAqIHRyYW5zbGF0aW9uIHdhcyBmb3VuZC5cbiAgICovXG4gIGdldEpzb25UcmFuc2xhdGlvbihsb2NhbGUpIHtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBKU09OIHJlc291cmNlXG4gICAgaWYgKHRoaXMuanNvblBhcmFtZXRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cblxuICAgIC8vIElmIGxvY2FsZSBpcyBub3Qgc2V0IHVzZSB0aGUgZmFsbGJhY2sgbG9jYWxlXG4gICAgbG9jYWxlID0gbG9jYWxlIHx8IHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGU7XG5cbiAgICAvLyBHZXQgbWF0Y2hpbmcgdHJhbnNsYXRpb24gYnkgbG9jYWxlLCBsYW5ndWFnZSBvciBmYWxsYmFjayBsb2NhbGVcbiAgICBjb25zdCBsYW5ndWFnZSA9IGxvY2FsZS5zcGxpdCgnLScpWzBdO1xuICAgIGNvbnN0IHJlc291cmNlID1cbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbbG9jYWxlXSB8fFxuICAgICAgdGhpcy5qc29uUGFyYW1ldGVyc1tsYW5ndWFnZV0gfHxcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZV0gfHxcbiAgICAgIHt9O1xuICAgIGNvbnN0IHRyYW5zbGF0aW9uID0gcmVzb3VyY2UudHJhbnNsYXRpb24gfHwge307XG4gICAgcmV0dXJuIHRyYW5zbGF0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSB0cmFuc2xhdGlvbiBmcm9tIHRoZSBKU09OIHJlc291cmNlIGZvciBhIGdpdmVuIGxvY2FsZSB3aXRoXG4gICAqIHBsYWNlaG9sZGVycyBmaWxsZWQgaW4gYnkgZ2l2ZW4gcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlIHRvIHRyYW5zbGF0ZSB0by5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycyB0byBmaWxsIGludG8gYW55IHBsYWNlaG9sZGVyc1xuICAgKiB3aXRoaW4gdGhlIHRyYW5zbGF0aW9ucy5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHRyYW5zbGF0aW9uIG9yIGFuIGVtcHR5IG9iamVjdCBpZiBubyBtYXRjaGluZ1xuICAgKiB0cmFuc2xhdGlvbiB3YXMgZm91bmQuXG4gICAqL1xuICBnZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zID0ge30pIHtcbiAgICAvLyBJZiBsb2NhbGl6YXRpb24gaXMgZGlzYWJsZWQgb3IgdGhlcmUgaXMgbm8gSlNPTiByZXNvdXJjZVxuICAgIGlmICghdGhpcy5wYWdlc0NvbmZpZy5lbmFibGVMb2NhbGl6YXRpb24gfHwgIXRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGgpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG5cbiAgICAvLyBHZXQgSlNPTiBwbGFjZWhvbGRlcnNcbiAgICBsZXQgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uVHJhbnNsYXRpb24obG9jYWxlKTtcblxuICAgIC8vIEZpbGwgaW4gYW55IHBsYWNlaG9sZGVycyBpbiB0aGUgdHJhbnNsYXRpb247IHRoaXMgYWxsb3dzIGEgdHJhbnNsYXRpb25cbiAgICAvLyB0byBjb250YWluIGRlZmF1bHQgcGxhY2Vob2xkZXJzIGxpa2Uge3thcHBOYW1lfX0gd2hpY2ggYXJlIGZpbGxlZCBoZXJlXG4gICAgcGxhY2Vob2xkZXJzID0gSlNPTi5zdHJpbmdpZnkocGxhY2Vob2xkZXJzKTtcbiAgICBwbGFjZWhvbGRlcnMgPSBtdXN0YWNoZS5yZW5kZXIocGxhY2Vob2xkZXJzLCBwYXJhbXMpO1xuICAgIHBsYWNlaG9sZGVycyA9IEpTT04ucGFyc2UocGxhY2Vob2xkZXJzKTtcblxuICAgIHJldHVybiBwbGFjZWhvbGRlcnM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHJlc3BvbnNlIHdpdGggZmlsZSBjb250ZW50LlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBvZiB0aGUgZmlsZSB0byByZXR1cm4uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGFyYW1zPXt9XSBUaGUgcGFyYW1ldGVycyB0byBiZSBpbmNsdWRlZCBpbiB0aGUgcmVzcG9uc2VcbiAgICogaGVhZGVyLiBUaGVzZSB3aWxsIGFsc28gYmUgdXNlZCB0byBmaWxsIHBsYWNlaG9sZGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtwbGFjZWhvbGRlcnM9e31dIFRoZSBwbGFjZWhvbGRlcnMgdG8gZmlsbCBpbiB0aGUgY29udGVudC5cbiAgICogVGhlc2Ugd2lsbCBub3QgYmUgaW5jbHVkZWQgaW4gdGhlIHJlc3BvbnNlIGhlYWRlci5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIFByb21pc2UgUm91dGVyIHJlc3BvbnNlLlxuICAgKi9cbiAgYXN5bmMgcGFnZVJlc3BvbnNlKHBhdGgsIHBhcmFtcyA9IHt9LCBwbGFjZWhvbGRlcnMgPSB7fSkge1xuICAgIC8vIEdldCBmaWxlIGNvbnRlbnRcbiAgICBsZXQgZGF0YTtcbiAgICB0cnkge1xuICAgICAgZGF0YSA9IGF3YWl0IHRoaXMucmVhZEZpbGUocGF0aCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgY29uZmlnIHBsYWNlaG9sZGVyczsgY2FuIGJlIGFuIG9iamVjdCwgYSBmdW5jdGlvbiBvciBhbiBhc3luYyBmdW5jdGlvblxuICAgIGxldCBjb25maWdQbGFjZWhvbGRlcnMgPVxuICAgICAgdHlwZW9mIHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzID09PSAnZnVuY3Rpb24nXG4gICAgICAgID8gdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnMocGFyYW1zKVxuICAgICAgICA6IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVycykgPT09ICdbb2JqZWN0IE9iamVjdF0nXG4gICAgICAgICAgPyB0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVyc1xuICAgICAgICAgIDoge307XG4gICAgaWYgKGNvbmZpZ1BsYWNlaG9sZGVycyBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgIGNvbmZpZ1BsYWNlaG9sZGVycyA9IGF3YWl0IGNvbmZpZ1BsYWNlaG9sZGVycztcbiAgICB9XG5cbiAgICAvLyBGaWxsIHBsYWNlaG9sZGVyc1xuICAgIGNvbnN0IGFsbFBsYWNlaG9sZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIGNvbmZpZ1BsYWNlaG9sZGVycywgcGxhY2Vob2xkZXJzKTtcbiAgICBjb25zdCBwYXJhbXNBbmRQbGFjZWhvbGRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBwYXJhbXMsIGFsbFBsYWNlaG9sZGVycyk7XG4gICAgZGF0YSA9IG11c3RhY2hlLnJlbmRlcihkYXRhLCBwYXJhbXNBbmRQbGFjZWhvbGRlcnMpO1xuXG4gICAgLy8gQWRkIHBsYWNlaG9sZGVycyBpbiBoZWFkZXIgdG8gYWxsb3cgcGFyc2luZyBmb3IgcHJvZ3JhbW1hdGljIHVzZVxuICAgIC8vIG9mIHJlc3BvbnNlLCBpbnN0ZWFkIG9mIGhhdmluZyB0byBwYXJzZSB0aGUgSFRNTCBjb250ZW50LlxuICAgIGNvbnN0IGhlYWRlcnMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW2Ake3BhZ2VQYXJhbUhlYWRlclByZWZpeH0ke3BbMF0udG9Mb3dlckNhc2UoKX1gXSA9IHBbMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gbTtcbiAgICB9LCB7fSk7XG5cbiAgICByZXR1cm4geyB0ZXh0OiBkYXRhLCBoZWFkZXJzOiBoZWFkZXJzIH07XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHJlc3BvbnNlIHdpdGggZmlsZSBjb250ZW50LlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBvZiB0aGUgZmlsZSB0byByZXR1cm4uXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlUm91dGVyIHJlc3BvbnNlLlxuICAgKi9cbiAgYXN5bmMgZmlsZVJlc3BvbnNlKHBhdGgpIHtcbiAgICAvLyBHZXQgZmlsZSBjb250ZW50XG4gICAgbGV0IGRhdGE7XG4gICAgdHJ5IHtcbiAgICAgIGRhdGEgPSBhd2FpdCB0aGlzLnJlYWRGaWxlKHBhdGgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgdGV4dDogZGF0YSB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlYWRzIGFuZCByZXR1cm5zIHRoZSBjb250ZW50IG9mIGEgZmlsZSBhdCBhIGdpdmVuIHBhdGguIEZpbGUgcmVhZGluZyB0b1xuICAgKiBzZXJ2ZSBjb250ZW50IG9uIHRoZSBzdGF0aWMgcm91dGUgaXMgb25seSBhbGxvd2VkIGZyb20gdGhlIHBhZ2VzXG4gICAqIGRpcmVjdG9yeSBvbiBkb3dud2FyZHMuXG4gICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAqICoqV0FSTklORzoqKiBBbGwgZmlsZSByZWFkcyBpbiB0aGUgUGFnZXNSb3V0ZXIgbXVzdCBiZSBleGVjdXRlZCBieSB0aGlzXG4gICAqIHdyYXBwZXIgYmVjYXVzZSBpdCBhbHNvIGRldGVjdHMgYW5kIHByZXZlbnRzIGNvbW1vbiBleHBsb2l0cy5cbiAgICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICogQHBhcmFtIHtTdHJpbmd9IGZpbGVQYXRoIFRoZSBwYXRoIHRvIHRoZSBmaWxlIHRvIHJlYWQuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFN0cmluZz59IFRoZSBmaWxlIGNvbnRlbnQuXG4gICAqL1xuICBhc3luYyByZWFkRmlsZShmaWxlUGF0aCkge1xuICAgIC8vIE5vcm1hbGl6ZSBwYXRoIHRvIHByZXZlbnQgaXQgZnJvbSBjb250YWluaW5nIGFueSBkaXJlY3RvcnkgY2hhbmdpbmdcbiAgICAvLyBVTklYIHBhdHRlcm5zIHdoaWNoIGNvdWxkIGV4cG9zZSB0aGUgd2hvbGUgZmlsZSBzeXN0ZW0sIGUuZy5cbiAgICAvLyBgaHR0cDovL2V4YW1wbGUuY29tL3BhcnNlL2FwcHMvLi4vZmlsZS50eHRgIHJlcXVlc3RzIGEgZmlsZSBvdXRzaWRlXG4gICAgLy8gb2YgdGhlIHBhZ2VzIGRpcmVjdG9yeSBzY29wZS5cbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IHBhdGgubm9ybWFsaXplKGZpbGVQYXRoKTtcblxuICAgIC8vIEFib3J0IGlmIHRoZSBwYXRoIGlzIG91dHNpZGUgb2YgdGhlIHBhdGggZGlyZWN0b3J5IHNjb3BlXG4gICAgaWYgKCFub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKHRoaXMucGFnZXNQYXRoKSkge1xuICAgICAgdGhyb3cgZXJyb3JzLmZpbGVPdXRzaWRlQWxsb3dlZFNjb3BlO1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCBmcy5yZWFkRmlsZShub3JtYWxpemVkUGF0aCwgJ3V0Zi04Jyk7XG4gIH1cblxuICAvKipcbiAgICogTG9hZHMgYSBsYW5ndWFnZSByZXNvdXJjZSBKU09OIGZpbGUgdGhhdCBpcyB1c2VkIGZvciB0cmFuc2xhdGlvbnMuXG4gICAqL1xuICBsb2FkSnNvblJlc291cmNlKCkge1xuICAgIGlmICh0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkpzb25QYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGpzb24gPSByZXF1aXJlKHBhdGgucmVzb2x2ZSgnLi8nLCB0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkpzb25QYXRoKSk7XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzID0ganNvbjtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aHJvdyBlcnJvcnMuanNvbkZhaWxlZEZpbGVMb2FkaW5nO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBFeHRyYWN0cyBhbmQgcmV0dXJucyB0aGUgcGFnZSBkZWZhdWx0IHBhcmFtZXRlcnMgZnJvbSB0aGUgUGFyc2UgU2VydmVyXG4gICAqIGNvbmZpZ3VyYXRpb24uIFRoZXNlIHBhcmFtZXRlcnMgYXJlIG1hZGUgYWNjZXNzaWJsZSBpbiBldmVyeSBwYWdlIHNlcnZlZFxuICAgKiBieSB0aGlzIHJvdXRlci5cbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBkZWZhdWx0IHBhcmFtZXRlcnMuXG4gICAqL1xuICBnZXREZWZhdWx0UGFyYW1zKGNvbmZpZykge1xuICAgIHJldHVybiBjb25maWdcbiAgICAgID8ge1xuICAgICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IGNvbmZpZy5hcHBJZCxcbiAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBbcGFnZVBhcmFtcy5wdWJsaWNTZXJ2ZXJVcmxdOiBjb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgfVxuICAgICAgOiB7fTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeHRyYWN0cyBhbmQgcmV0dXJucyB0aGUgbG9jYWxlIGZyb20gYW4gZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSBleHByZXNzIHJlcXVlc3QuXG4gICAqIEByZXR1cm5zIHtTdHJpbmd8dW5kZWZpbmVkfSBUaGUgbG9jYWxlLCBvciB1bmRlZmluZWQgaWYgbm8gbG9jYWxlIHdhcyBzZXQuXG4gICAqL1xuICBnZXRMb2NhbGUocmVxKSB7XG4gICAgY29uc3QgbG9jYWxlID1cbiAgICAgIChyZXEucXVlcnkgfHwge30pW3BhZ2VQYXJhbXMubG9jYWxlXSB8fFxuICAgICAgKHJlcS5ib2R5IHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEucGFyYW1zIHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEuaGVhZGVycyB8fCB7fSlbcGFnZVBhcmFtSGVhZGVyUHJlZml4ICsgcGFnZVBhcmFtcy5sb2NhbGVdO1xuICAgIHJldHVybiBsb2NhbGU7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHJlc3BvbnNlIHdpdGggaHR0cCByZWRpcmVjdC5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBvZiB0aGUgZmlsZSB0byByZXR1cm4uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHF1ZXJ5IHBhcmFtZXRlcnMgdG8gaW5jbHVkZS5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIFByb21pc2UgUm91dGVyIHJlc3BvbnNlLlxuICAgKi9cbiAgYXN5bmMgcmVkaXJlY3RSZXNwb25zZSh1cmwsIHBhcmFtcykge1xuICAgIC8vIFJlbW92ZSBhbnkgcGFyYW1ldGVycyB3aXRoIHVuZGVmaW5lZCB2YWx1ZVxuICAgIHBhcmFtcyA9IE9iamVjdC5lbnRyaWVzKHBhcmFtcykucmVkdWNlKChtLCBwKSA9PiB7XG4gICAgICBpZiAocFsxXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIG1bcFswXV0gPSBwWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG07XG4gICAgfSwge30pO1xuXG4gICAgLy8gQ29tcG9zZSBVUkwgd2l0aCBwYXJhbWV0ZXJzIGluIHF1ZXJ5XG4gICAgY29uc3QgbG9jYXRpb24gPSBuZXcgVVJMKHVybCk7XG4gICAgT2JqZWN0LmVudHJpZXMocGFyYW1zKS5mb3JFYWNoKHAgPT4gbG9jYXRpb24uc2VhcmNoUGFyYW1zLnNldChwWzBdLCBwWzFdKSk7XG4gICAgY29uc3QgbG9jYXRpb25TdHJpbmcgPSBsb2NhdGlvbi50b1N0cmluZygpO1xuXG4gICAgLy8gQWRkIHBhcmFtZXRlcnMgdG8gaGVhZGVyIHRvIGFsbG93IHBhcnNpbmcgZm9yIHByb2dyYW1tYXRpYyB1c2VcbiAgICAvLyBvZiByZXNwb25zZSwgaW5zdGVhZCBvZiBoYXZpbmcgdG8gcGFyc2UgdGhlIEhUTUwgY29udGVudC5cbiAgICBjb25zdCBoZWFkZXJzID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5yZWR1Y2UoKG0sIHApID0+IHtcbiAgICAgIGlmIChwWzFdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbVtgJHtwYWdlUGFyYW1IZWFkZXJQcmVmaXh9JHtwWzBdLnRvTG93ZXJDYXNlKCl9YF0gPSBwWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG07XG4gICAgfSwge30pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogMzAzLFxuICAgICAgbG9jYXRpb246IGxvY2F0aW9uU3RyaW5nLFxuICAgICAgaGVhZGVyczogaGVhZGVycyxcbiAgICB9O1xuICB9XG5cbiAgZGVmYXVsdFBhZ2VQYXRoKGZpbGUpIHtcbiAgICByZXR1cm4gcGF0aC5qb2luKHRoaXMucGFnZXNQYXRoLCBmaWxlKTtcbiAgfVxuXG4gIGNvbXBvc2VQYWdlVXJsKGZpbGUsIHB1YmxpY1NlcnZlclVybCwgbG9jYWxlKSB7XG4gICAgbGV0IHVybCA9IHB1YmxpY1NlcnZlclVybDtcbiAgICB1cmwgKz0gdXJsLmVuZHNXaXRoKCcvJykgPyAnJyA6ICcvJztcbiAgICB1cmwgKz0gdGhpcy5wYWdlc0VuZHBvaW50ICsgJy8nO1xuICAgIHVybCArPSBsb2NhbGUgPT09IHVuZGVmaW5lZCA/ICcnIDogbG9jYWxlICsgJy8nO1xuICAgIHVybCArPSBmaWxlO1xuICAgIHJldHVybiB1cmw7XG4gIH1cblxuICBub3RGb3VuZCgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdGV4dDogJ05vdCBmb3VuZC4nLFxuICAgICAgc3RhdHVzOiA0MDQsXG4gICAgfTtcbiAgfVxuXG4gIGludmFsaWRSZXF1ZXN0KCkge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSAndW5hdXRob3JpemVkJztcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXRzIHRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiBpbiB0aGUgcmVxdWVzdCBvYmplY3QgdG8gbWFrZSBpdFxuICAgKiBlYXNpbHkgYWNjZXNzaWJsZSB0aHJvdWdodG91dCByZXF1ZXN0IHByb2Nlc3NpbmcuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3QuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gZmFpbEdyYWNlZnVsbHkgSXMgdHJ1ZSBpZiBmYWlsaW5nIHRvIHNldCB0aGUgY29uZmlnIHNob3VsZFxuICAgKiBub3QgcmVzdWx0IGluIGFuIGludmFsaWQgcmVxdWVzdCByZXNwb25zZS4gRGVmYXVsdCBpcyBgZmFsc2VgLlxuICAgKi9cbiAgc2V0Q29uZmlnKHJlcSwgZmFpbEdyYWNlZnVsbHkgPSBmYWxzZSkge1xuICAgIHJlcS5jb25maWcgPSBDb25maWcuZ2V0KHJlcS5wYXJhbXMuYXBwSWQgfHwgcmVxLnF1ZXJ5LmFwcElkKTtcbiAgICBpZiAoIXJlcS5jb25maWcgJiYgIWZhaWxHcmFjZWZ1bGx5KSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIG1vdW50UGFnZXNSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3ZlcmlmeV9lbWFpbGAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnZlcmlmeUVtYWlsKHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvcmVzZW5kX3ZlcmlmaWNhdGlvbl9lbWFpbGAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9L2Nob29zZV9wYXNzd29yZGAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhc3N3b3JkUmVzZXQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQT1NUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzZXRQYXNzd29yZChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvcmVxdWVzdF9wYXNzd29yZF9yZXNldGAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlcXVlc3RSZXNldFBhc3N3b3JkKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIG1vdW50Q3VzdG9tUm91dGVzKCkge1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2YgdGhpcy5wYWdlc0NvbmZpZy5jdXN0b21Sb3V0ZXMgfHwgW10pIHtcbiAgICAgIHRoaXMucm91dGUoXG4gICAgICAgIHJvdXRlLm1ldGhvZCxcbiAgICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkLyR7cm91dGUucGF0aH1gLFxuICAgICAgICByZXEgPT4ge1xuICAgICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICAgIH0sXG4gICAgICAgIGFzeW5jIHJlcSA9PiB7XG4gICAgICAgICAgY29uc3QgeyBmaWxlLCBxdWVyeSA9IHt9IH0gPSAoYXdhaXQgcm91dGUuaGFuZGxlcihyZXEpKSB8fCB7fTtcblxuICAgICAgICAgIC8vIElmIHJvdXRlIGhhbmRsZXIgZGlkIG5vdCByZXR1cm4gYSBwYWdlIHNlbmQgNDA0IHJlc3BvbnNlXG4gICAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZCgpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFNlbmQgcGFnZSByZXNwb25zZVxuICAgICAgICAgIGNvbnN0IHBhZ2UgPSBuZXcgUGFnZSh7IGlkOiBmaWxlLCBkZWZhdWx0RmlsZTogZmlsZSB9KTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2UsIHF1ZXJ5LCBmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgbW91bnRTdGF0aWNSb3V0ZSgpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS8oKik/YCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSwgdHJ1ZSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGljUm91dGUocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgZXhwcmVzc1JvdXRlcigpIHtcbiAgICBjb25zdCByb3V0ZXIgPSBleHByZXNzLlJvdXRlcigpO1xuICAgIHJvdXRlci51c2UoJy8nLCBzdXBlci5leHByZXNzUm91dGVyKCkpO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFnZXNSb3V0ZXI7XG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgUGFnZXNSb3V0ZXIsXG4gIHBhZ2VQYXJhbUhlYWRlclByZWZpeCxcbiAgcGFnZVBhcmFtcyxcbiAgcGFnZXMsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBMkI7QUFFM0I7QUFDQSxNQUFNQSxLQUFLLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDO0VBQzFCQyxhQUFhLEVBQUUsSUFBSUMsYUFBSSxDQUFDO0lBQUVDLEVBQUUsRUFBRSxlQUFlO0lBQUVDLFdBQVcsRUFBRTtFQUFzQixDQUFDLENBQUM7RUFDcEZDLG9CQUFvQixFQUFFLElBQUlILGFBQUksQ0FBQztJQUM3QkMsRUFBRSxFQUFFLHNCQUFzQjtJQUMxQkMsV0FBVyxFQUFFO0VBQ2YsQ0FBQyxDQUFDO0VB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