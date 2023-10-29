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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9leHByZXNzIiwiX3BhdGgiLCJfZnMiLCJfbm9kZSIsIl9VdGlscyIsIl9tdXN0YWNoZSIsIl9QYWdlIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJwYWdlcyIsIk9iamVjdCIsImZyZWV6ZSIsInBhc3N3b3JkUmVzZXQiLCJQYWdlIiwiaWQiLCJkZWZhdWx0RmlsZSIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFzc3dvcmRSZXNldExpbmtJbnZhbGlkIiwiZW1haWxWZXJpZmljYXRpb25TdWNjZXNzIiwiZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCIsImVtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3MiLCJlbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkIiwiZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCIsInBhZ2VQYXJhbXMiLCJhcHBOYW1lIiwiYXBwSWQiLCJ0b2tlbiIsInVzZXJuYW1lIiwiZXJyb3IiLCJsb2NhbGUiLCJwdWJsaWNTZXJ2ZXJVcmwiLCJwYWdlUGFyYW1IZWFkZXJQcmVmaXgiLCJlcnJvcnMiLCJqc29uRmFpbGVkRmlsZUxvYWRpbmciLCJmaWxlT3V0c2lkZUFsbG93ZWRTY29wZSIsIlBhZ2VzUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImNvbnN0cnVjdG9yIiwicGFnZXNDb25maWciLCJwYWdlc0VuZHBvaW50IiwicGFnZXNQYXRoIiwicGF0aCIsInJlc29sdmUiLCJfX2Rpcm5hbWUiLCJsb2FkSnNvblJlc291cmNlIiwibW91bnRQYWdlc1JvdXRlcyIsIm1vdW50Q3VzdG9tUm91dGVzIiwibW91bnRTdGF0aWNSb3V0ZSIsInZlcmlmeUVtYWlsIiwicmVxIiwiY29uZmlnIiwicmF3VG9rZW4iLCJxdWVyeSIsInRvU3RyaW5nIiwiaW52YWxpZFJlcXVlc3QiLCJnb1RvUGFnZSIsInVzZXJDb250cm9sbGVyIiwidGhlbiIsInBhcmFtcyIsInJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiYm9keSIsInB1YmxpY1NlcnZlclVSTCIsInJlcXVlc3RSZXNldFBhc3N3b3JkIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJhcHBsaWNhdGlvbklkIiwicmVzZXRQYXNzd29yZCIsIm5ld19wYXNzd29yZCIsInhociIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiT1RIRVJfQ0FVU0UiLCJQQVNTV09SRF9NSVNTSU5HIiwidXBkYXRlUGFzc3dvcmQiLCJQcm9taXNlIiwic3VjY2VzcyIsImVyciIsInJlc3VsdCIsInN0YXR1cyIsInJlc3BvbnNlIiwicGFnZSIsInJlc3BvbnNlVHlwZSIsInJlZGlyZWN0IiwiZm9yY2VSZWRpcmVjdCIsInVuZGVmaW5lZCIsIm1ldGhvZCIsImRlZmF1bHRQYXJhbXMiLCJnZXREZWZhdWx0UGFyYW1zIiwidmFsdWVzIiwiaW5jbHVkZXMiLCJub3RGb3VuZCIsImFzc2lnbiIsImdldExvY2FsZSIsImRlZmF1bHRQYXRoIiwiZGVmYXVsdFBhZ2VQYXRoIiwiZGVmYXVsdFVybCIsImNvbXBvc2VQYWdlVXJsIiwiY3VzdG9tVXJsIiwiY3VzdG9tVXJscyIsIlV0aWxzIiwiaXNQYXRoIiwicmVkaXJlY3RSZXNwb25zZSIsInBsYWNlaG9sZGVycyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiZ2V0SnNvblBsYWNlaG9sZGVycyIsImdldExvY2FsaXplZFBhdGgiLCJzdWJkaXIiLCJwYWdlUmVzcG9uc2UiLCJzdGF0aWNSb3V0ZSIsInJlbGF0aXZlUGF0aCIsImFic29sdXRlUGF0aCIsImVuZHNXaXRoIiwiZmlsZVJlc3BvbnNlIiwiZ2V0SnNvblRyYW5zbGF0aW9uIiwianNvblBhcmFtZXRlcnMiLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsImxhbmd1YWdlIiwic3BsaXQiLCJyZXNvdXJjZSIsInRyYW5zbGF0aW9uIiwiSlNPTiIsInN0cmluZ2lmeSIsIm11c3RhY2hlIiwicmVuZGVyIiwicGFyc2UiLCJkYXRhIiwicmVhZEZpbGUiLCJlIiwiY29uZmlnUGxhY2Vob2xkZXJzIiwicHJvdG90eXBlIiwiY2FsbCIsImFsbFBsYWNlaG9sZGVycyIsInBhcmFtc0FuZFBsYWNlaG9sZGVycyIsImhlYWRlcnMiLCJlbnRyaWVzIiwicmVkdWNlIiwibSIsInAiLCJ0b0xvd2VyQ2FzZSIsInRleHQiLCJmaWxlUGF0aCIsIm5vcm1hbGl6ZWRQYXRoIiwibm9ybWFsaXplIiwic3RhcnRzV2l0aCIsImZzIiwianNvbiIsInVybCIsImxvY2F0aW9uIiwiVVJMIiwiZm9yRWFjaCIsInNlYXJjaFBhcmFtcyIsInNldCIsImxvY2F0aW9uU3RyaW5nIiwiZmlsZSIsImpvaW4iLCJtZXNzYWdlIiwic2V0Q29uZmlnIiwiZmFpbEdyYWNlZnVsbHkiLCJDb25maWciLCJnZXQiLCJyb3V0ZSIsImN1c3RvbVJvdXRlcyIsImhhbmRsZXIiLCJleHByZXNzUm91dGVyIiwicm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsInVzZSIsImV4cG9ydHMiLCJfZGVmYXVsdCIsIm1vZHVsZSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1BhZ2VzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHByb21pc2VzIGFzIGZzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgbXVzdGFjaGUgZnJvbSAnbXVzdGFjaGUnO1xuaW1wb3J0IFBhZ2UgZnJvbSAnLi4vUGFnZSc7XG5cbi8vIEFsbCBwYWdlcyB3aXRoIGN1c3RvbSBwYWdlIGtleSBmb3IgcmVmZXJlbmNlIGFuZCBmaWxlIG5hbWVcbmNvbnN0IHBhZ2VzID0gT2JqZWN0LmZyZWV6ZSh7XG4gIHBhc3N3b3JkUmVzZXQ6IG5ldyBQYWdlKHsgaWQ6ICdwYXNzd29yZFJlc2V0JywgZGVmYXVsdEZpbGU6ICdwYXNzd29yZF9yZXNldC5odG1sJyB9KSxcbiAgcGFzc3dvcmRSZXNldFN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ3Bhc3N3b3JkUmVzZXRTdWNjZXNzJyxcbiAgICBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbCcsXG4gIH0pLFxuICBwYXNzd29yZFJlc2V0TGlua0ludmFsaWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ3Bhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdwYXNzd29yZF9yZXNldF9saW5rX2ludmFsaWQuaHRtbCcsXG4gIH0pLFxuICBlbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU3VjY2VzcycsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWw6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWwnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX3NlbmRfZmFpbC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3MnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX3NlbmRfc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX2xpbmtfaW52YWxpZC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX2xpbmtfZXhwaXJlZC5odG1sJyxcbiAgfSksXG59KTtcblxuLy8gQWxsIHBhZ2UgcGFyYW1ldGVycyBmb3IgcmVmZXJlbmNlIHRvIGJlIHVzZWQgYXMgdGVtcGxhdGUgcGxhY2Vob2xkZXJzIG9yIHF1ZXJ5IHBhcmFtc1xuY29uc3QgcGFnZVBhcmFtcyA9IE9iamVjdC5mcmVlemUoe1xuICBhcHBOYW1lOiAnYXBwTmFtZScsXG4gIGFwcElkOiAnYXBwSWQnLFxuICB0b2tlbjogJ3Rva2VuJyxcbiAgdXNlcm5hbWU6ICd1c2VybmFtZScsXG4gIGVycm9yOiAnZXJyb3InLFxuICBsb2NhbGU6ICdsb2NhbGUnLFxuICBwdWJsaWNTZXJ2ZXJVcmw6ICdwdWJsaWNTZXJ2ZXJVcmwnLFxufSk7XG5cbi8vIFRoZSBoZWFkZXIgcHJlZml4IHRvIGFkZCBwYWdlIHBhcmFtcyBhcyByZXNwb25zZSBoZWFkZXJzXG5jb25zdCBwYWdlUGFyYW1IZWFkZXJQcmVmaXggPSAneC1wYXJzZS1wYWdlLXBhcmFtLSc7XG5cbi8vIFRoZSBlcnJvcnMgYmVpbmcgdGhyb3duXG5jb25zdCBlcnJvcnMgPSBPYmplY3QuZnJlZXplKHtcbiAganNvbkZhaWxlZEZpbGVMb2FkaW5nOiAnZmFpbGVkIHRvIGxvYWQgSlNPTiBmaWxlJyxcbiAgZmlsZU91dHNpZGVBbGxvd2VkU2NvcGU6ICdub3QgYWxsb3dlZCB0byByZWFkIGZpbGUgb3V0c2lkZSBvZiBwYWdlcyBkaXJlY3RvcnknLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBQYWdlc1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICAvKipcbiAgICogQ29uc3RydWN0cyBhIFBhZ2VzUm91dGVyLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFnZXMgVGhlIHBhZ2VzIG9wdGlvbnMgZnJvbSB0aGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gICAqL1xuICBjb25zdHJ1Y3RvcihwYWdlcyA9IHt9KSB7XG4gICAgc3VwZXIoKTtcblxuICAgIC8vIFNldCBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gICAgdGhpcy5wYWdlc0NvbmZpZyA9IHBhZ2VzO1xuICAgIHRoaXMucGFnZXNFbmRwb2ludCA9IHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPyBwYWdlcy5wYWdlc0VuZHBvaW50IDogJ2FwcHMnO1xuICAgIHRoaXMucGFnZXNQYXRoID0gcGFnZXMucGFnZXNQYXRoXG4gICAgICA/IHBhdGgucmVzb2x2ZSgnLi8nLCBwYWdlcy5wYWdlc1BhdGgpXG4gICAgICA6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9wdWJsaWMnKTtcbiAgICB0aGlzLmxvYWRKc29uUmVzb3VyY2UoKTtcbiAgICB0aGlzLm1vdW50UGFnZXNSb3V0ZXMoKTtcbiAgICB0aGlzLm1vdW50Q3VzdG9tUm91dGVzKCk7XG4gICAgdGhpcy5tb3VudFN0YXRpY1JvdXRlKCk7XG4gIH1cblxuICB2ZXJpZnlFbWFpbChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgaWYgKCF0b2tlbiB8fCAhdXNlcm5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnZlcmlmeUVtYWlsKHVzZXJuYW1lLCB0b2tlbikudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25TdWNjZXNzLCBwYXJhbXMpO1xuICAgICAgfSxcbiAgICAgICgpID0+IHtcbiAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCwgcGFyYW1zKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB1c2VybmFtZSA9IHJlcS5ib2R5LnVzZXJuYW1lO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuXG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXJuYW1lLCByZXEpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2Vzcyk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWwpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBwYXNzd29yZFJlc2V0KHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiByZXEucGFyYW1zLmFwcElkLFxuICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgW3BhZ2VQYXJhbXMudG9rZW5dOiByZXEucXVlcnkudG9rZW4sXG4gICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHJlcS5xdWVyeS51c2VybmFtZSxcbiAgICAgIFtwYWdlUGFyYW1zLnB1YmxpY1NlcnZlclVybF06IGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXQsIHBhcmFtcyk7XG4gIH1cblxuICByZXF1ZXN0UmVzZXRQYXNzd29yZChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHVzZXJuYW1lLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5xdWVyeTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIXVzZXJuYW1lIHx8ICF0b2tlbikge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0TGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIHJldHVybiBjb25maWcudXNlckNvbnRyb2xsZXIuY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudG9rZW5dOiB0b2tlbixcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcElkXTogY29uZmlnLmFwcGxpY2F0aW9uSWQsXG4gICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXQsIHBhcmFtcyk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0TGlua0ludmFsaWQsIHBhcmFtcyk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHJlc2V0UGFzc3dvcmQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgY29uc3QgeyB1c2VybmFtZSwgbmV3X3Bhc3N3b3JkLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5ib2R5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICgoIXVzZXJuYW1lIHx8ICF0b2tlbiB8fCAhbmV3X3Bhc3N3b3JkKSAmJiByZXEueGhyID09PSBmYWxzZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0TGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnTWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cblxuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ01pc3NpbmcgdG9rZW4nKTtcbiAgICB9XG5cbiAgICBpZiAoIW5ld19wYXNzd29yZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdNaXNzaW5nIHBhc3N3b3JkJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbmZpZy51c2VyQ29udHJvbGxlclxuICAgICAgLnVwZGF0ZVBhc3N3b3JkKHVzZXJuYW1lLCB0b2tlbiwgbmV3X3Bhc3N3b3JkKVxuICAgICAgLnRoZW4oXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycixcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlcS54aHIpIHtcbiAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgICBzdGF0dXM6IDIwMCxcbiAgICAgICAgICAgICAgcmVzcG9uc2U6ICdQYXNzd29yZCBzdWNjZXNzZnVsbHkgcmVzZXQnLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXN1bHQuZXJyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsIGAke3Jlc3VsdC5lcnJ9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXN1bHQuc3VjY2Vzc1xuICAgICAgICAgID8ge1xuICAgICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgICB9XG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMudG9rZW5dOiB0b2tlbixcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcElkXTogY29uZmlnLmFwcGxpY2F0aW9uSWQsXG4gICAgICAgICAgICBbcGFnZVBhcmFtcy5lcnJvcl06IHJlc3VsdC5lcnIsXG4gICAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgY29uc3QgcGFnZSA9IHJlc3VsdC5zdWNjZXNzID8gcGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgOiBwYWdlcy5wYXNzd29yZFJlc2V0O1xuXG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZSwgcXVlcnksIGZhbHNlKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgcGFnZSBjb250ZW50IGlmIHRoZSBwYWdlIGlzIGEgbG9jYWwgZmlsZSBvciByZXR1cm5zIGFcbiAgICogcmVkaXJlY3QgdG8gYSBjdXN0b20gcGFnZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge1BhZ2V9IHBhZ2UgVGhlIHBhZ2UgdG8gZ28gdG8uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGFyYW1zPXt9XSBUaGUgcXVlcnkgcGFyYW1ldGVycyB0byBhdHRhY2ggdG8gdGhlIFVSTCBpbiBjYXNlIG9mXG4gICAqIEhUVFAgcmVkaXJlY3QgcmVzcG9uc2VzIGZvciBQT1NUIHJlcXVlc3RzLCBvciB0aGUgcGxhY2Vob2xkZXJzIHRvIGZpbGwgaW50b1xuICAgKiB0aGUgcmVzcG9uc2UgY29udGVudCBpbiBjYXNlIG9mIEhUVFAgY29udGVudCByZXNwb25zZXMgZm9yIEdFVCByZXF1ZXN0cy5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbcmVzcG9uc2VUeXBlXSBJcyB0cnVlIGlmIGEgcmVkaXJlY3QgcmVzcG9uc2Ugc2hvdWxkIGJlIGZvcmNlZCxcbiAgICogZmFsc2UgaWYgYSBjb250ZW50IHJlc3BvbnNlIHNob3VsZCBiZSBmb3JjZWQsIHVuZGVmaW5lZCBpZiB0aGUgcmVzcG9uc2UgdHlwZVxuICAgKiBzaG91bGQgZGVwZW5kIG9uIHRoZSByZXF1ZXN0IHR5cGUgYnkgZGVmYXVsdDpcbiAgICogLSBHRVQgcmVxdWVzdCAtPiBjb250ZW50IHJlc3BvbnNlXG4gICAqIC0gUE9TVCByZXF1ZXN0IC0+IHJlZGlyZWN0IHJlc3BvbnNlIChQUkcgcGF0dGVybilcbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIFByb21pc2VSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBnb1RvUGFnZShyZXEsIHBhZ2UsIHBhcmFtcyA9IHt9LCByZXNwb25zZVR5cGUpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHJlZGlyZWN0IGVpdGhlciBieSBmb3JjZSwgcmVzcG9uc2Ugc2V0dGluZyBvciByZXF1ZXN0IG1ldGhvZFxuICAgIGNvbnN0IHJlZGlyZWN0ID0gY29uZmlnLnBhZ2VzLmZvcmNlUmVkaXJlY3RcbiAgICAgID8gdHJ1ZVxuICAgICAgOiByZXNwb25zZVR5cGUgIT09IHVuZGVmaW5lZFxuICAgICAgICA/IHJlc3BvbnNlVHlwZVxuICAgICAgICA6IHJlcS5tZXRob2QgPT0gJ1BPU1QnO1xuXG4gICAgLy8gSW5jbHVkZSBkZWZhdWx0IHBhcmFtZXRlcnNcbiAgICBjb25zdCBkZWZhdWx0UGFyYW1zID0gdGhpcy5nZXREZWZhdWx0UGFyYW1zKGNvbmZpZyk7XG4gICAgaWYgKE9iamVjdC52YWx1ZXMoZGVmYXVsdFBhcmFtcykuaW5jbHVkZXModW5kZWZpbmVkKSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICB9XG4gICAgcGFyYW1zID0gT2JqZWN0LmFzc2lnbihwYXJhbXMsIGRlZmF1bHRQYXJhbXMpO1xuXG4gICAgLy8gQWRkIGxvY2FsZSB0byBwYXJhbXMgdG8gZW5zdXJlIGl0IGlzIHBhc3NlZCBvbiB3aXRoIGV2ZXJ5IHJlcXVlc3Q7XG4gICAgLy8gdGhhdCBtZWFucywgb25jZSBhIGxvY2FsZSBpcyBzZXQsIGl0IGlzIHBhc3NlZCBvbiB0byBhbnkgZm9sbG93LXVwIHBhZ2UsXG4gICAgLy8gZS5nLiByZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0IC0+IHBhc3N3b3JkX3Jlc2V0IC0+IHBhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3NcbiAgICBjb25zdCBsb2NhbGUgPSB0aGlzLmdldExvY2FsZShyZXEpO1xuICAgIHBhcmFtc1twYWdlUGFyYW1zLmxvY2FsZV0gPSBsb2NhbGU7XG5cbiAgICAvLyBDb21wb3NlIHBhdGhzIGFuZCBVUkxzXG4gICAgY29uc3QgZGVmYXVsdEZpbGUgPSBwYWdlLmRlZmF1bHRGaWxlO1xuICAgIGNvbnN0IGRlZmF1bHRQYXRoID0gdGhpcy5kZWZhdWx0UGFnZVBhdGgoZGVmYXVsdEZpbGUpO1xuICAgIGNvbnN0IGRlZmF1bHRVcmwgPSB0aGlzLmNvbXBvc2VQYWdlVXJsKGRlZmF1bHRGaWxlLCBjb25maWcucHVibGljU2VydmVyVVJMKTtcblxuICAgIC8vIElmIGN1c3RvbSBVUkwgaXMgc2V0IHJlZGlyZWN0IHRvIGl0IHdpdGhvdXQgbG9jYWxpemF0aW9uXG4gICAgY29uc3QgY3VzdG9tVXJsID0gY29uZmlnLnBhZ2VzLmN1c3RvbVVybHNbcGFnZS5pZF07XG4gICAgaWYgKGN1c3RvbVVybCAmJiAhVXRpbHMuaXNQYXRoKGN1c3RvbVVybCkpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0UmVzcG9uc2UoY3VzdG9tVXJsLCBwYXJhbXMpO1xuICAgIH1cblxuICAgIC8vIEdldCBKU09OIHBsYWNlaG9sZGVyc1xuICAgIGxldCBwbGFjZWhvbGRlcnMgPSB7fTtcbiAgICBpZiAoY29uZmlnLnBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiAmJiBjb25maWcucGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGgpIHtcbiAgICAgIHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyk7XG4gICAgfVxuXG4gICAgLy8gU2VuZCByZXNwb25zZVxuICAgIGlmIChjb25maWcucGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uICYmIGxvY2FsZSkge1xuICAgICAgcmV0dXJuIFV0aWxzLmdldExvY2FsaXplZFBhdGgoZGVmYXVsdFBhdGgsIGxvY2FsZSkudGhlbigoeyBwYXRoLCBzdWJkaXIgfSkgPT5cbiAgICAgICAgcmVkaXJlY3RcbiAgICAgICAgICA/IHRoaXMucmVkaXJlY3RSZXNwb25zZShcbiAgICAgICAgICAgIHRoaXMuY29tcG9zZVBhZ2VVcmwoZGVmYXVsdEZpbGUsIGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsIHN1YmRpciksXG4gICAgICAgICAgICBwYXJhbXNcbiAgICAgICAgICApXG4gICAgICAgICAgOiB0aGlzLnBhZ2VSZXNwb25zZShwYXRoLCBwYXJhbXMsIHBsYWNlaG9sZGVycylcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiByZWRpcmVjdFxuICAgICAgICA/IHRoaXMucmVkaXJlY3RSZXNwb25zZShkZWZhdWx0VXJsLCBwYXJhbXMpXG4gICAgICAgIDogdGhpcy5wYWdlUmVzcG9uc2UoZGVmYXVsdFBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2VydmVzIGEgcmVxdWVzdCB0byBhIHN0YXRpYyByZXNvdXJjZSBhbmQgbG9jYWxpemVzIHRoZSByZXNvdXJjZSBpZiBpdFxuICAgKiBpcyBhIEhUTUwgZmlsZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdCBvYmplY3QuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSByZXNwb25zZS5cbiAgICovXG4gIHN0YXRpY1JvdXRlKHJlcSkge1xuICAgIC8vIEdldCByZXF1ZXN0ZWQgcGF0aFxuICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHJlcS5wYXJhbXNbMF07XG5cbiAgICAvLyBSZXNvbHZlIHJlcXVlc3RlZCBwYXRoIHRvIGFic29sdXRlIHBhdGhcbiAgICBjb25zdCBhYnNvbHV0ZVBhdGggPSBwYXRoLnJlc29sdmUodGhpcy5wYWdlc1BhdGgsIHJlbGF0aXZlUGF0aCk7XG5cbiAgICAvLyBJZiB0aGUgcmVxdWVzdGVkIGZpbGUgaXMgbm90IGEgSFRNTCBmaWxlIHNlbmQgaXRzIHJhdyBjb250ZW50XG4gICAgaWYgKCFhYnNvbHV0ZVBhdGggfHwgIWFic29sdXRlUGF0aC5lbmRzV2l0aCgnLmh0bWwnKSkge1xuICAgICAgcmV0dXJuIHRoaXMuZmlsZVJlc3BvbnNlKGFic29sdXRlUGF0aCk7XG4gICAgfVxuXG4gICAgLy8gR2V0IHBhcmFtZXRlcnNcbiAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmdldERlZmF1bHRQYXJhbXMocmVxLmNvbmZpZyk7XG4gICAgY29uc3QgbG9jYWxlID0gdGhpcy5nZXRMb2NhbGUocmVxKTtcbiAgICBpZiAobG9jYWxlKSB7XG4gICAgICBwYXJhbXMubG9jYWxlID0gbG9jYWxlO1xuICAgIH1cblxuICAgIC8vIEdldCBKU09OIHBsYWNlaG9sZGVyc1xuICAgIGNvbnN0IHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyk7XG5cbiAgICByZXR1cm4gdGhpcy5wYWdlUmVzcG9uc2UoYWJzb2x1dGVQYXRoLCBwYXJhbXMsIHBsYWNlaG9sZGVycyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhIHRyYW5zbGF0aW9uIGZyb20gdGhlIEpTT04gcmVzb3VyY2UgZm9yIGEgZ2l2ZW4gbG9jYWxlLiBUaGUgSlNPTlxuICAgKiByZXNvdXJjZSBpcyBwYXJzZWQgYWNjb3JkaW5nIHRvIGkxOG5leHQgc3ludGF4LlxuICAgKlxuICAgKiBFeGFtcGxlIEpTT04gY29udGVudDpcbiAgICogYGBganNcbiAgICogIHtcbiAgICogICAgXCJlblwiOiB7ICAgICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxhbmd1YWdlIGBlbmAgKEVuZ2xpc2gpXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiSGVsbG8hXCJcbiAgICogICAgICB9XG4gICAqICAgIH0sXG4gICAqICAgIFwiZGVcIjogeyAgICAgICAgICAgICAgIC8vIHJlc291cmNlIGZvciBsYW5ndWFnZSBgZGVgIChHZXJtYW4pXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiSGFsbG8hXCJcbiAgICogICAgICB9XG4gICAqICAgIH1cbiAgICogICAgXCJkZS1DSFwiOiB7ICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxvY2FsZSBgZGUtQ0hgIChTd2lzcyBHZXJtYW4pXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiR3LDvGV6aSFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfVxuICAgKiAgfVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlIHRvIHRyYW5zbGF0ZSB0by5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHRyYW5zbGF0aW9uIG9yIGFuIGVtcHR5IG9iamVjdCBpZiBubyBtYXRjaGluZ1xuICAgKiB0cmFuc2xhdGlvbiB3YXMgZm91bmQuXG4gICAqL1xuICBnZXRKc29uVHJhbnNsYXRpb24obG9jYWxlKSB7XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gSlNPTiByZXNvdXJjZVxuICAgIGlmICh0aGlzLmpzb25QYXJhbWV0ZXJzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG5cbiAgICAvLyBJZiBsb2NhbGUgaXMgbm90IHNldCB1c2UgdGhlIGZhbGxiYWNrIGxvY2FsZVxuICAgIGxvY2FsZSA9IGxvY2FsZSB8fCB0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlO1xuXG4gICAgLy8gR2V0IG1hdGNoaW5nIHRyYW5zbGF0aW9uIGJ5IGxvY2FsZSwgbGFuZ3VhZ2Ugb3IgZmFsbGJhY2sgbG9jYWxlXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBsb2NhbGUuc3BsaXQoJy0nKVswXTtcbiAgICBjb25zdCByZXNvdXJjZSA9XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzW2xvY2FsZV0gfHxcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbbGFuZ3VhZ2VdIHx8XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzW3RoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGVdIHx8XG4gICAgICB7fTtcbiAgICBjb25zdCB0cmFuc2xhdGlvbiA9IHJlc291cmNlLnRyYW5zbGF0aW9uIHx8IHt9O1xuICAgIHJldHVybiB0cmFuc2xhdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgdHJhbnNsYXRpb24gZnJvbSB0aGUgSlNPTiByZXNvdXJjZSBmb3IgYSBnaXZlbiBsb2NhbGUgd2l0aFxuICAgKiBwbGFjZWhvbGRlcnMgZmlsbGVkIGluIGJ5IGdpdmVuIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsb2NhbGUgVGhlIGxvY2FsZSB0byB0cmFuc2xhdGUgdG8uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gZmlsbCBpbnRvIGFueSBwbGFjZWhvbGRlcnNcbiAgICogd2l0aGluIHRoZSB0cmFuc2xhdGlvbnMuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSB0cmFuc2xhdGlvbiBvciBhbiBlbXB0eSBvYmplY3QgaWYgbm8gbWF0Y2hpbmdcbiAgICogdHJhbnNsYXRpb24gd2FzIGZvdW5kLlxuICAgKi9cbiAgZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyA9IHt9KSB7XG4gICAgLy8gSWYgbG9jYWxpemF0aW9uIGlzIGRpc2FibGVkIG9yIHRoZXJlIGlzIG5vIEpTT04gcmVzb3VyY2VcbiAgICBpZiAoIXRoaXMucGFnZXNDb25maWcuZW5hYmxlTG9jYWxpemF0aW9uIHx8ICF0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkpzb25QYXRoKSB7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgbGV0IHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblRyYW5zbGF0aW9uKGxvY2FsZSk7XG5cbiAgICAvLyBGaWxsIGluIGFueSBwbGFjZWhvbGRlcnMgaW4gdGhlIHRyYW5zbGF0aW9uOyB0aGlzIGFsbG93cyBhIHRyYW5zbGF0aW9uXG4gICAgLy8gdG8gY29udGFpbiBkZWZhdWx0IHBsYWNlaG9sZGVycyBsaWtlIHt7YXBwTmFtZX19IHdoaWNoIGFyZSBmaWxsZWQgaGVyZVxuICAgIHBsYWNlaG9sZGVycyA9IEpTT04uc3RyaW5naWZ5KHBsYWNlaG9sZGVycyk7XG4gICAgcGxhY2Vob2xkZXJzID0gbXVzdGFjaGUucmVuZGVyKHBsYWNlaG9sZGVycywgcGFyYW1zKTtcbiAgICBwbGFjZWhvbGRlcnMgPSBKU09OLnBhcnNlKHBsYWNlaG9sZGVycyk7XG5cbiAgICByZXR1cm4gcGxhY2Vob2xkZXJzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGZpbGUgY29udGVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW3BhcmFtcz17fV0gVGhlIHBhcmFtZXRlcnMgdG8gYmUgaW5jbHVkZWQgaW4gdGhlIHJlc3BvbnNlXG4gICAqIGhlYWRlci4gVGhlc2Ugd2lsbCBhbHNvIGJlIHVzZWQgdG8gZmlsbCBwbGFjZWhvbGRlcnMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGxhY2Vob2xkZXJzPXt9XSBUaGUgcGxhY2Vob2xkZXJzIHRvIGZpbGwgaW4gdGhlIGNvbnRlbnQuXG4gICAqIFRoZXNlIHdpbGwgbm90IGJlIGluY2x1ZGVkIGluIHRoZSByZXNwb25zZSBoZWFkZXIuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlIFJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIHBhZ2VSZXNwb25zZShwYXRoLCBwYXJhbXMgPSB7fSwgcGxhY2Vob2xkZXJzID0ge30pIHtcbiAgICAvLyBHZXQgZmlsZSBjb250ZW50XG4gICAgbGV0IGRhdGE7XG4gICAgdHJ5IHtcbiAgICAgIGRhdGEgPSBhd2FpdCB0aGlzLnJlYWRGaWxlKHBhdGgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuXG4gICAgLy8gR2V0IGNvbmZpZyBwbGFjZWhvbGRlcnM7IGNhbiBiZSBhbiBvYmplY3QsIGEgZnVuY3Rpb24gb3IgYW4gYXN5bmMgZnVuY3Rpb25cbiAgICBsZXQgY29uZmlnUGxhY2Vob2xkZXJzID1cbiAgICAgIHR5cGVvZiB0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVycyA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICA/IHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzKHBhcmFtcylcbiAgICAgICAgOiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnMpID09PSAnW29iamVjdCBPYmplY3RdJ1xuICAgICAgICAgID8gdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnNcbiAgICAgICAgICA6IHt9O1xuICAgIGlmIChjb25maWdQbGFjZWhvbGRlcnMgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICBjb25maWdQbGFjZWhvbGRlcnMgPSBhd2FpdCBjb25maWdQbGFjZWhvbGRlcnM7XG4gICAgfVxuXG4gICAgLy8gRmlsbCBwbGFjZWhvbGRlcnNcbiAgICBjb25zdCBhbGxQbGFjZWhvbGRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBjb25maWdQbGFjZWhvbGRlcnMsIHBsYWNlaG9sZGVycyk7XG4gICAgY29uc3QgcGFyYW1zQW5kUGxhY2Vob2xkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgcGFyYW1zLCBhbGxQbGFjZWhvbGRlcnMpO1xuICAgIGRhdGEgPSBtdXN0YWNoZS5yZW5kZXIoZGF0YSwgcGFyYW1zQW5kUGxhY2Vob2xkZXJzKTtcblxuICAgIC8vIEFkZCBwbGFjZWhvbGRlcnMgaW4gaGVhZGVyIHRvIGFsbG93IHBhcnNpbmcgZm9yIHByb2dyYW1tYXRpYyB1c2VcbiAgICAvLyBvZiByZXNwb25zZSwgaW5zdGVhZCBvZiBoYXZpbmcgdG8gcGFyc2UgdGhlIEhUTUwgY29udGVudC5cbiAgICBjb25zdCBoZWFkZXJzID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5yZWR1Y2UoKG0sIHApID0+IHtcbiAgICAgIGlmIChwWzFdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbVtgJHtwYWdlUGFyYW1IZWFkZXJQcmVmaXh9JHtwWzBdLnRvTG93ZXJDYXNlKCl9YF0gPSBwWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG07XG4gICAgfSwge30pO1xuXG4gICAgcmV0dXJuIHsgdGV4dDogZGF0YSwgaGVhZGVyczogaGVhZGVycyB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGZpbGUgY29udGVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZVJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIGZpbGVSZXNwb25zZShwYXRoKSB7XG4gICAgLy8gR2V0IGZpbGUgY29udGVudFxuICAgIGxldCBkYXRhO1xuICAgIHRyeSB7XG4gICAgICBkYXRhID0gYXdhaXQgdGhpcy5yZWFkRmlsZShwYXRoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZCgpO1xuICAgIH1cblxuICAgIHJldHVybiB7IHRleHQ6IGRhdGEgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWFkcyBhbmQgcmV0dXJucyB0aGUgY29udGVudCBvZiBhIGZpbGUgYXQgYSBnaXZlbiBwYXRoLiBGaWxlIHJlYWRpbmcgdG9cbiAgICogc2VydmUgY29udGVudCBvbiB0aGUgc3RhdGljIHJvdXRlIGlzIG9ubHkgYWxsb3dlZCBmcm9tIHRoZSBwYWdlc1xuICAgKiBkaXJlY3Rvcnkgb24gZG93bndhcmRzLlxuICAgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgKiAqKldBUk5JTkc6KiogQWxsIGZpbGUgcmVhZHMgaW4gdGhlIFBhZ2VzUm91dGVyIG11c3QgYmUgZXhlY3V0ZWQgYnkgdGhpc1xuICAgKiB3cmFwcGVyIGJlY2F1c2UgaXQgYWxzbyBkZXRlY3RzIGFuZCBwcmV2ZW50cyBjb21tb24gZXhwbG9pdHMuXG4gICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlUGF0aCBUaGUgcGF0aCB0byB0aGUgZmlsZSB0byByZWFkLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxTdHJpbmc+fSBUaGUgZmlsZSBjb250ZW50LlxuICAgKi9cbiAgYXN5bmMgcmVhZEZpbGUoZmlsZVBhdGgpIHtcbiAgICAvLyBOb3JtYWxpemUgcGF0aCB0byBwcmV2ZW50IGl0IGZyb20gY29udGFpbmluZyBhbnkgZGlyZWN0b3J5IGNoYW5naW5nXG4gICAgLy8gVU5JWCBwYXR0ZXJucyB3aGljaCBjb3VsZCBleHBvc2UgdGhlIHdob2xlIGZpbGUgc3lzdGVtLCBlLmcuXG4gICAgLy8gYGh0dHA6Ly9leGFtcGxlLmNvbS9wYXJzZS9hcHBzLy4uL2ZpbGUudHh0YCByZXF1ZXN0cyBhIGZpbGUgb3V0c2lkZVxuICAgIC8vIG9mIHRoZSBwYWdlcyBkaXJlY3Rvcnkgc2NvcGUuXG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBwYXRoLm5vcm1hbGl6ZShmaWxlUGF0aCk7XG5cbiAgICAvLyBBYm9ydCBpZiB0aGUgcGF0aCBpcyBvdXRzaWRlIG9mIHRoZSBwYXRoIGRpcmVjdG9yeSBzY29wZVxuICAgIGlmICghbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aCh0aGlzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93IGVycm9ycy5maWxlT3V0c2lkZUFsbG93ZWRTY29wZTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXdhaXQgZnMucmVhZEZpbGUobm9ybWFsaXplZFBhdGgsICd1dGYtOCcpO1xuICB9XG5cbiAgLyoqXG4gICAqIExvYWRzIGEgbGFuZ3VhZ2UgcmVzb3VyY2UgSlNPTiBmaWxlIHRoYXQgaXMgdXNlZCBmb3IgdHJhbnNsYXRpb25zLlxuICAgKi9cbiAgbG9hZEpzb25SZXNvdXJjZSgpIHtcbiAgICBpZiAodGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBqc29uID0gcmVxdWlyZShwYXRoLnJlc29sdmUoJy4vJywgdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpO1xuICAgICAgdGhpcy5qc29uUGFyYW1ldGVycyA9IGpzb247XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhyb3cgZXJyb3JzLmpzb25GYWlsZWRGaWxlTG9hZGluZztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIHBhZ2UgZGVmYXVsdCBwYXJhbWV0ZXJzIGZyb20gdGhlIFBhcnNlIFNlcnZlclxuICAgKiBjb25maWd1cmF0aW9uLiBUaGVzZSBwYXJhbWV0ZXJzIGFyZSBtYWRlIGFjY2Vzc2libGUgaW4gZXZlcnkgcGFnZSBzZXJ2ZWRcbiAgICogYnkgdGhpcyByb3V0ZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgZGVmYXVsdCBwYXJhbWV0ZXJzLlxuICAgKi9cbiAgZ2V0RGVmYXVsdFBhcmFtcyhjb25maWcpIHtcbiAgICByZXR1cm4gY29uZmlnXG4gICAgICA/IHtcbiAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwSWQsXG4gICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgW3BhZ2VQYXJhbXMucHVibGljU2VydmVyVXJsXTogY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgIH1cbiAgICAgIDoge307XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIGxvY2FsZSBmcm9tIGFuIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcmV0dXJucyB7U3RyaW5nfHVuZGVmaW5lZH0gVGhlIGxvY2FsZSwgb3IgdW5kZWZpbmVkIGlmIG5vIGxvY2FsZSB3YXMgc2V0LlxuICAgKi9cbiAgZ2V0TG9jYWxlKHJlcSkge1xuICAgIGNvbnN0IGxvY2FsZSA9XG4gICAgICAocmVxLnF1ZXJ5IHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEuYm9keSB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLnBhcmFtcyB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLmhlYWRlcnMgfHwge30pW3BhZ2VQYXJhbUhlYWRlclByZWZpeCArIHBhZ2VQYXJhbXMubG9jYWxlXTtcbiAgICByZXR1cm4gbG9jYWxlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGh0dHAgcmVkaXJlY3QuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBxdWVyeSBwYXJhbWV0ZXJzIHRvIGluY2x1ZGUuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlIFJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIHJlZGlyZWN0UmVzcG9uc2UodXJsLCBwYXJhbXMpIHtcbiAgICAvLyBSZW1vdmUgYW55IHBhcmFtZXRlcnMgd2l0aCB1bmRlZmluZWQgdmFsdWVcbiAgICBwYXJhbXMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW3BbMF1dID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIENvbXBvc2UgVVJMIHdpdGggcGFyYW1ldGVycyBpbiBxdWVyeVxuICAgIGNvbnN0IGxvY2F0aW9uID0gbmV3IFVSTCh1cmwpO1xuICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtcykuZm9yRWFjaChwID0+IGxvY2F0aW9uLnNlYXJjaFBhcmFtcy5zZXQocFswXSwgcFsxXSkpO1xuICAgIGNvbnN0IGxvY2F0aW9uU3RyaW5nID0gbG9jYXRpb24udG9TdHJpbmcoKTtcblxuICAgIC8vIEFkZCBwYXJhbWV0ZXJzIHRvIGhlYWRlciB0byBhbGxvdyBwYXJzaW5nIGZvciBwcm9ncmFtbWF0aWMgdXNlXG4gICAgLy8gb2YgcmVzcG9uc2UsIGluc3RlYWQgb2YgaGF2aW5nIHRvIHBhcnNlIHRoZSBIVE1MIGNvbnRlbnQuXG4gICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5lbnRyaWVzKHBhcmFtcykucmVkdWNlKChtLCBwKSA9PiB7XG4gICAgICBpZiAocFsxXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIG1bYCR7cGFnZVBhcmFtSGVhZGVyUHJlZml4fSR7cFswXS50b0xvd2VyQ2FzZSgpfWBdID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6IDMwMyxcbiAgICAgIGxvY2F0aW9uOiBsb2NhdGlvblN0cmluZyxcbiAgICAgIGhlYWRlcnM6IGhlYWRlcnMsXG4gICAgfTtcbiAgfVxuXG4gIGRlZmF1bHRQYWdlUGF0aChmaWxlKSB7XG4gICAgcmV0dXJuIHBhdGguam9pbih0aGlzLnBhZ2VzUGF0aCwgZmlsZSk7XG4gIH1cblxuICBjb21wb3NlUGFnZVVybChmaWxlLCBwdWJsaWNTZXJ2ZXJVcmwsIGxvY2FsZSkge1xuICAgIGxldCB1cmwgPSBwdWJsaWNTZXJ2ZXJVcmw7XG4gICAgdXJsICs9IHVybC5lbmRzV2l0aCgnLycpID8gJycgOiAnLyc7XG4gICAgdXJsICs9IHRoaXMucGFnZXNFbmRwb2ludCArICcvJztcbiAgICB1cmwgKz0gbG9jYWxlID09PSB1bmRlZmluZWQgPyAnJyA6IGxvY2FsZSArICcvJztcbiAgICB1cmwgKz0gZmlsZTtcbiAgICByZXR1cm4gdXJsO1xuICB9XG5cbiAgbm90Rm91bmQoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRleHQ6ICdOb3QgZm91bmQuJyxcbiAgICAgIHN0YXR1czogNDA0LFxuICAgIH07XG4gIH1cblxuICBpbnZhbGlkUmVxdWVzdCgpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gaW4gdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIG1ha2UgaXRcbiAgICogZWFzaWx5IGFjY2Vzc2libGUgdGhyb3VnaHRvdXQgcmVxdWVzdCBwcm9jZXNzaW5nLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZhaWxHcmFjZWZ1bGx5IElzIHRydWUgaWYgZmFpbGluZyB0byBzZXQgdGhlIGNvbmZpZyBzaG91bGRcbiAgICogbm90IHJlc3VsdCBpbiBhbiBpbnZhbGlkIHJlcXVlc3QgcmVzcG9uc2UuIERlZmF1bHQgaXMgYGZhbHNlYC5cbiAgICovXG4gIHNldENvbmZpZyhyZXEsIGZhaWxHcmFjZWZ1bGx5ID0gZmFsc2UpIHtcbiAgICByZXEuY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkIHx8IHJlcS5xdWVyeS5hcHBJZCk7XG4gICAgaWYgKCFyZXEuY29uZmlnICYmICFmYWlsR3JhY2VmdWxseSkge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBtb3VudFBhZ2VzUm91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC92ZXJpZnlfZW1haWxgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy52ZXJpZnlFbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3Jlc2VuZF92ZXJpZmljYXRpb25fZW1haWxgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS9jaG9vc2VfcGFzc3dvcmRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXNzd29yZFJlc2V0KHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvcmVxdWVzdF9wYXNzd29yZF9yZXNldGAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc2V0UGFzc3dvcmQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXF1ZXN0UmVzZXRQYXNzd29yZChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBtb3VudEN1c3RvbVJvdXRlcygpIHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMucGFnZXNDb25maWcuY3VzdG9tUm91dGVzIHx8IFtdKSB7XG4gICAgICB0aGlzLnJvdXRlKFxuICAgICAgICByb3V0ZS5tZXRob2QsXG4gICAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC8ke3JvdXRlLnBhdGh9YCxcbiAgICAgICAgcmVxID0+IHtcbiAgICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgICB9LFxuICAgICAgICBhc3luYyByZXEgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgZmlsZSwgcXVlcnkgPSB7fSB9ID0gKGF3YWl0IHJvdXRlLmhhbmRsZXIocmVxKSkgfHwge307XG5cbiAgICAgICAgICAvLyBJZiByb3V0ZSBoYW5kbGVyIGRpZCBub3QgcmV0dXJuIGEgcGFnZSBzZW5kIDQwNCByZXNwb25zZVxuICAgICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBTZW5kIHBhZ2UgcmVzcG9uc2VcbiAgICAgICAgICBjb25zdCBwYWdlID0gbmV3IFBhZ2UoeyBpZDogZmlsZSwgZGVmYXVsdEZpbGU6IGZpbGUgfSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlLCBxdWVyeSwgZmFsc2UpO1xuICAgICAgICB9XG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIG1vdW50U3RhdGljUm91dGUoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vKCopP2AsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEsIHRydWUpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRpY1JvdXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGV4cHJlc3NSb3V0ZXIoKSB7XG4gICAgY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIudXNlKCcvJywgc3VwZXIuZXhwcmVzc1JvdXRlcigpKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhZ2VzUm91dGVyO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIFBhZ2VzUm91dGVyLFxuICBwYWdlUGFyYW1IZWFkZXJQcmVmaXgsXG4gIHBhZ2VQYXJhbXMsXG4gIHBhZ2VzLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsY0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsUUFBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFB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