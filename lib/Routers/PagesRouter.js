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
}); // All page parameters for reference to be used as template placeholders or query params

const pageParams = Object.freeze({
  appName: 'appName',
  appId: 'appId',
  token: 'token',
  username: 'username',
  error: 'error',
  locale: 'locale',
  publicServerUrl: 'publicServerUrl'
}); // The header prefix to add page params as response headers

const pageParamHeaderPrefix = 'x-parse-page-param-'; // The errors being thrown

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
    super(); // Set instance properties

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
    return userController.resendVerificationEmail(username).then(() => {
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
    const config = req.config; // Determine redirect either by force, response setting or request method

    const redirect = config.pages.forceRedirect ? true : responseType !== undefined ? responseType : req.method == 'POST'; // Include default parameters

    const defaultParams = this.getDefaultParams(config);

    if (Object.values(defaultParams).includes(undefined)) {
      return this.notFound();
    }

    params = Object.assign(params, defaultParams); // Add locale to params to ensure it is passed on with every request;
    // that means, once a locale is set, it is passed on to any follow-up page,
    // e.g. request_password_reset -> password_reset -> password_reset_success

    const locale = this.getLocale(req);
    params[pageParams.locale] = locale; // Compose paths and URLs

    const defaultFile = page.defaultFile;
    const defaultPath = this.defaultPagePath(defaultFile);
    const defaultUrl = this.composePageUrl(defaultFile, config.publicServerURL); // If custom URL is set redirect to it without localization

    const customUrl = config.pages.customUrls[page.id];

    if (customUrl && !_Utils.default.isPath(customUrl)) {
      return this.redirectResponse(customUrl, params);
    } // Get JSON placeholders


    let placeholders = {};

    if (config.pages.enableLocalization && config.pages.localizationJsonPath) {
      placeholders = this.getJsonPlaceholders(locale, params);
    } // Send response


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
    const relativePath = req.params[0]; // Resolve requested path to absolute path

    const absolutePath = _path.default.resolve(this.pagesPath, relativePath); // If the requested file is not a HTML file send its raw content


    if (!absolutePath || !absolutePath.endsWith('.html')) {
      return this.fileResponse(absolutePath);
    } // Get parameters


    const params = this.getDefaultParams(req.config);
    const locale = this.getLocale(req);

    if (locale) {
      params.locale = locale;
    } // Get JSON placeholders


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
    } // If locale is not set use the fallback locale


    locale = locale || this.pagesConfig.localizationFallbackLocale; // Get matching translation by locale, language or fallback locale

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
    } // Get JSON placeholders


    let placeholders = this.getJsonTranslation(locale); // Fill in any placeholders in the translation; this allows a translation
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
    } // Get config placeholders; can be an object, a function or an async function


    let configPlaceholders = typeof this.pagesConfig.placeholders === 'function' ? this.pagesConfig.placeholders(params) : Object.prototype.toString.call(this.pagesConfig.placeholders) === '[object Object]' ? this.pagesConfig.placeholders : {};

    if (configPlaceholders instanceof Promise) {
      configPlaceholders = await configPlaceholders;
    } // Fill placeholders


    const allPlaceholders = Object.assign({}, configPlaceholders, placeholders);
    const paramsAndPlaceholders = Object.assign({}, params, allPlaceholders);
    data = _mustache.default.render(data, paramsAndPlaceholders); // Add placeholders in header to allow parsing for programmatic use
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
    const normalizedPath = _path.default.normalize(filePath); // Abort if the path is outside of the path directory scope


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
    }, {}); // Compose URL with parameters in query

    const location = new URL(url);
    Object.entries(params).forEach(p => location.searchParams.set(p[0], p[1]));
    const locationString = location.toString(); // Add parameters to header to allow parsing for programmatic use
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
        } = (await route.handler(req)) || {}; // If route handler did not return a page send 404 response

        if (!file) {
          return this.notFound();
        } // Send page response


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1BhZ2VzUm91dGVyLmpzIl0sIm5hbWVzIjpbInBhZ2VzIiwiT2JqZWN0IiwiZnJlZXplIiwicGFzc3dvcmRSZXNldCIsIlBhZ2UiLCJpZCIsImRlZmF1bHRGaWxlIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXNzd29yZFJlc2V0TGlua0ludmFsaWQiLCJlbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3MiLCJlbWFpbFZlcmlmaWNhdGlvblNlbmRGYWlsIiwiZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzcyIsImVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQiLCJlbWFpbFZlcmlmaWNhdGlvbkxpbmtFeHBpcmVkIiwicGFnZVBhcmFtcyIsImFwcE5hbWUiLCJhcHBJZCIsInRva2VuIiwidXNlcm5hbWUiLCJlcnJvciIsImxvY2FsZSIsInB1YmxpY1NlcnZlclVybCIsInBhZ2VQYXJhbUhlYWRlclByZWZpeCIsImVycm9ycyIsImpzb25GYWlsZWRGaWxlTG9hZGluZyIsImZpbGVPdXRzaWRlQWxsb3dlZFNjb3BlIiwiUGFnZXNSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwiY29uc3RydWN0b3IiLCJwYWdlc0NvbmZpZyIsInBhZ2VzRW5kcG9pbnQiLCJwYWdlc1BhdGgiLCJwYXRoIiwicmVzb2x2ZSIsIl9fZGlybmFtZSIsImxvYWRKc29uUmVzb3VyY2UiLCJtb3VudFBhZ2VzUm91dGVzIiwibW91bnRDdXN0b21Sb3V0ZXMiLCJtb3VudFN0YXRpY1JvdXRlIiwidmVyaWZ5RW1haWwiLCJyZXEiLCJjb25maWciLCJyYXdUb2tlbiIsInF1ZXJ5IiwidG9TdHJpbmciLCJpbnZhbGlkUmVxdWVzdCIsImdvVG9QYWdlIiwidXNlckNvbnRyb2xsZXIiLCJ0aGVuIiwicGFyYW1zIiwicmVzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJib2R5IiwicHVibGljU2VydmVyVVJMIiwicmVxdWVzdFJlc2V0UGFzc3dvcmQiLCJjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSIsImFwcGxpY2F0aW9uSWQiLCJyZXNldFBhc3N3b3JkIiwibmV3X3Bhc3N3b3JkIiwieGhyIiwiUGFyc2UiLCJFcnJvciIsIlVTRVJOQU1FX01JU1NJTkciLCJPVEhFUl9DQVVTRSIsIlBBU1NXT1JEX01JU1NJTkciLCJ1cGRhdGVQYXNzd29yZCIsIlByb21pc2UiLCJzdWNjZXNzIiwiZXJyIiwicmVzdWx0Iiwic3RhdHVzIiwicmVzcG9uc2UiLCJwYWdlIiwicmVzcG9uc2VUeXBlIiwicmVkaXJlY3QiLCJmb3JjZVJlZGlyZWN0IiwidW5kZWZpbmVkIiwibWV0aG9kIiwiZGVmYXVsdFBhcmFtcyIsImdldERlZmF1bHRQYXJhbXMiLCJ2YWx1ZXMiLCJpbmNsdWRlcyIsIm5vdEZvdW5kIiwiYXNzaWduIiwiZ2V0TG9jYWxlIiwiZGVmYXVsdFBhdGgiLCJkZWZhdWx0UGFnZVBhdGgiLCJkZWZhdWx0VXJsIiwiY29tcG9zZVBhZ2VVcmwiLCJjdXN0b21VcmwiLCJjdXN0b21VcmxzIiwiVXRpbHMiLCJpc1BhdGgiLCJyZWRpcmVjdFJlc3BvbnNlIiwicGxhY2Vob2xkZXJzIiwiZW5hYmxlTG9jYWxpemF0aW9uIiwibG9jYWxpemF0aW9uSnNvblBhdGgiLCJnZXRKc29uUGxhY2Vob2xkZXJzIiwiZ2V0TG9jYWxpemVkUGF0aCIsInN1YmRpciIsInBhZ2VSZXNwb25zZSIsInN0YXRpY1JvdXRlIiwicmVsYXRpdmVQYXRoIiwiYWJzb2x1dGVQYXRoIiwiZW5kc1dpdGgiLCJmaWxlUmVzcG9uc2UiLCJnZXRKc29uVHJhbnNsYXRpb24iLCJqc29uUGFyYW1ldGVycyIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwibGFuZ3VhZ2UiLCJzcGxpdCIsInJlc291cmNlIiwidHJhbnNsYXRpb24iLCJKU09OIiwic3RyaW5naWZ5IiwibXVzdGFjaGUiLCJyZW5kZXIiLCJwYXJzZSIsImRhdGEiLCJyZWFkRmlsZSIsImUiLCJjb25maWdQbGFjZWhvbGRlcnMiLCJwcm90b3R5cGUiLCJjYWxsIiwiYWxsUGxhY2Vob2xkZXJzIiwicGFyYW1zQW5kUGxhY2Vob2xkZXJzIiwiaGVhZGVycyIsImVudHJpZXMiLCJyZWR1Y2UiLCJtIiwicCIsInRvTG93ZXJDYXNlIiwidGV4dCIsImZpbGVQYXRoIiwibm9ybWFsaXplZFBhdGgiLCJub3JtYWxpemUiLCJzdGFydHNXaXRoIiwiZnMiLCJqc29uIiwicmVxdWlyZSIsInVybCIsImxvY2F0aW9uIiwiVVJMIiwiZm9yRWFjaCIsInNlYXJjaFBhcmFtcyIsInNldCIsImxvY2F0aW9uU3RyaW5nIiwiZmlsZSIsImpvaW4iLCJtZXNzYWdlIiwic2V0Q29uZmlnIiwiZmFpbEdyYWNlZnVsbHkiLCJDb25maWciLCJnZXQiLCJyb3V0ZSIsImN1c3RvbVJvdXRlcyIsImhhbmRsZXIiLCJleHByZXNzUm91dGVyIiwicm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsInVzZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUVBO0FBQ0EsTUFBTUEsS0FBSyxHQUFHQyxNQUFNLENBQUNDLE1BQVAsQ0FBYztBQUMxQkMsRUFBQUEsYUFBYSxFQUFFLElBQUlDLGFBQUosQ0FBUztBQUFFQyxJQUFBQSxFQUFFLEVBQUUsZUFBTjtBQUF1QkMsSUFBQUEsV0FBVyxFQUFFO0FBQXBDLEdBQVQsQ0FEVztBQUUxQkMsRUFBQUEsb0JBQW9CLEVBQUUsSUFBSUgsYUFBSixDQUFTO0FBQzdCQyxJQUFBQSxFQUFFLEVBQUUsc0JBRHlCO0FBRTdCQyxJQUFBQSxXQUFXLEVBQUU7QUFGZ0IsR0FBVCxDQUZJO0FBTTFCRSxFQUFBQSx3QkFBd0IsRUFBRSxJQUFJSixhQUFKLENBQVM7QUFDakNDLElBQUFBLEVBQUUsRUFBRSwwQkFENkI7QUFFakNDLElBQUFBLFdBQVcsRUFBRTtBQUZvQixHQUFULENBTkE7QUFVMUJHLEVBQUFBLHdCQUF3QixFQUFFLElBQUlMLGFB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QUFBO0FBSmUsQ0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBwcm9taXNlcyBhcyBmcyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgVXRpbHMgZnJvbSAnLi4vVXRpbHMnO1xuaW1wb3J0IG11c3RhY2hlIGZyb20gJ211c3RhY2hlJztcbmltcG9ydCBQYWdlIGZyb20gJy4uL1BhZ2UnO1xuXG4vLyBBbGwgcGFnZXMgd2l0aCBjdXN0b20gcGFnZSBrZXkgZm9yIHJlZmVyZW5jZSBhbmQgZmlsZSBuYW1lXG5jb25zdCBwYWdlcyA9IE9iamVjdC5mcmVlemUoe1xuICBwYXNzd29yZFJlc2V0OiBuZXcgUGFnZSh7IGlkOiAncGFzc3dvcmRSZXNldCcsIGRlZmF1bHRGaWxlOiAncGFzc3dvcmRfcmVzZXQuaHRtbCcgfSksXG4gIHBhc3N3b3JkUmVzZXRTdWNjZXNzOiBuZXcgUGFnZSh7XG4gICAgaWQ6ICdwYXNzd29yZFJlc2V0U3VjY2VzcycsXG4gICAgZGVmYXVsdEZpbGU6ICdwYXNzd29yZF9yZXNldF9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgcGFzc3dvcmRSZXNldExpbmtJbnZhbGlkOiBuZXcgUGFnZSh7XG4gICAgaWQ6ICdwYXNzd29yZFJlc2V0TGlua0ludmFsaWQnLFxuICAgIGRlZmF1bHRGaWxlOiAncGFzc3dvcmRfcmVzZXRfbGlua19pbnZhbGlkLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TdWNjZXNzOiBuZXcgUGFnZSh7XG4gICAgaWQ6ICdlbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3MnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX3N1Y2Nlc3MuaHRtbCcsXG4gIH0pLFxuICBlbWFpbFZlcmlmaWNhdGlvblNlbmRGYWlsOiBuZXcgUGFnZSh7XG4gICAgaWQ6ICdlbWFpbFZlcmlmaWNhdGlvblNlbmRGYWlsJyxcbiAgICBkZWZhdWx0RmlsZTogJ2VtYWlsX3ZlcmlmaWNhdGlvbl9zZW5kX2ZhaWwuaHRtbCcsXG4gIH0pLFxuICBlbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzOiBuZXcgUGFnZSh7XG4gICAgaWQ6ICdlbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzJyxcbiAgICBkZWZhdWx0RmlsZTogJ2VtYWlsX3ZlcmlmaWNhdGlvbl9zZW5kX3N1Y2Nlc3MuaHRtbCcsXG4gIH0pLFxuICBlbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkOiBuZXcgUGFnZSh7XG4gICAgaWQ6ICdlbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkJyxcbiAgICBkZWZhdWx0RmlsZTogJ2VtYWlsX3ZlcmlmaWNhdGlvbl9saW5rX2ludmFsaWQuaHRtbCcsXG4gIH0pLFxuICBlbWFpbFZlcmlmaWNhdGlvbkxpbmtFeHBpcmVkOiBuZXcgUGFnZSh7XG4gICAgaWQ6ICdlbWFpbFZlcmlmaWNhdGlvbkxpbmtFeHBpcmVkJyxcbiAgICBkZWZhdWx0RmlsZTogJ2VtYWlsX3ZlcmlmaWNhdGlvbl9saW5rX2V4cGlyZWQuaHRtbCcsXG4gIH0pLFxufSk7XG5cbi8vIEFsbCBwYWdlIHBhcmFtZXRlcnMgZm9yIHJlZmVyZW5jZSB0byBiZSB1c2VkIGFzIHRlbXBsYXRlIHBsYWNlaG9sZGVycyBvciBxdWVyeSBwYXJhbXNcbmNvbnN0IHBhZ2VQYXJhbXMgPSBPYmplY3QuZnJlZXplKHtcbiAgYXBwTmFtZTogJ2FwcE5hbWUnLFxuICBhcHBJZDogJ2FwcElkJyxcbiAgdG9rZW46ICd0b2tlbicsXG4gIHVzZXJuYW1lOiAndXNlcm5hbWUnLFxuICBlcnJvcjogJ2Vycm9yJyxcbiAgbG9jYWxlOiAnbG9jYWxlJyxcbiAgcHVibGljU2VydmVyVXJsOiAncHVibGljU2VydmVyVXJsJyxcbn0pO1xuXG4vLyBUaGUgaGVhZGVyIHByZWZpeCB0byBhZGQgcGFnZSBwYXJhbXMgYXMgcmVzcG9uc2UgaGVhZGVyc1xuY29uc3QgcGFnZVBhcmFtSGVhZGVyUHJlZml4ID0gJ3gtcGFyc2UtcGFnZS1wYXJhbS0nO1xuXG4vLyBUaGUgZXJyb3JzIGJlaW5nIHRocm93blxuY29uc3QgZXJyb3JzID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGpzb25GYWlsZWRGaWxlTG9hZGluZzogJ2ZhaWxlZCB0byBsb2FkIEpTT04gZmlsZScsXG4gIGZpbGVPdXRzaWRlQWxsb3dlZFNjb3BlOiAnbm90IGFsbG93ZWQgdG8gcmVhZCBmaWxlIG91dHNpZGUgb2YgcGFnZXMgZGlyZWN0b3J5Jyxcbn0pO1xuXG5leHBvcnQgY2xhc3MgUGFnZXNSb3V0ZXIgZXh0ZW5kcyBQcm9taXNlUm91dGVyIHtcbiAgLyoqXG4gICAqIENvbnN0cnVjdHMgYSBQYWdlc1JvdXRlci5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhZ2VzIFRoZSBwYWdlcyBvcHRpb25zIGZyb20gdGhlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICAgKi9cbiAgY29uc3RydWN0b3IocGFnZXMgPSB7fSkge1xuICAgIHN1cGVyKCk7XG5cbiAgICAvLyBTZXQgaW5zdGFuY2UgcHJvcGVydGllc1xuICAgIHRoaXMucGFnZXNDb25maWcgPSBwYWdlcztcbiAgICB0aGlzLnBhZ2VzRW5kcG9pbnQgPSBwYWdlcy5wYWdlc0VuZHBvaW50ID8gcGFnZXMucGFnZXNFbmRwb2ludCA6ICdhcHBzJztcbiAgICB0aGlzLnBhZ2VzUGF0aCA9IHBhZ2VzLnBhZ2VzUGF0aFxuICAgICAgPyBwYXRoLnJlc29sdmUoJy4vJywgcGFnZXMucGFnZXNQYXRoKVxuICAgICAgOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vcHVibGljJyk7XG4gICAgdGhpcy5sb2FkSnNvblJlc291cmNlKCk7XG4gICAgdGhpcy5tb3VudFBhZ2VzUm91dGVzKCk7XG4gICAgdGhpcy5tb3VudEN1c3RvbVJvdXRlcygpO1xuICAgIHRoaXMubW91bnRTdGF0aWNSb3V0ZSgpO1xuICB9XG5cbiAgdmVyaWZ5RW1haWwocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB7IHVzZXJuYW1lLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5xdWVyeTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGlmICghdG9rZW4gfHwgIXVzZXJuYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci52ZXJpZnlFbWFpbCh1c2VybmFtZSwgdG9rZW4pLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uU3VjY2VzcywgcGFyYW1zKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQsIHBhcmFtcyk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgdXNlcm5hbWUgPSByZXEuYm9keS51c2VybmFtZTtcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHBhc3N3b3JkUmVzZXQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IHJlcS5wYXJhbXMuYXBwSWQsXG4gICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHJlcS5xdWVyeS50b2tlbixcbiAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogcmVxLnF1ZXJ5LnVzZXJuYW1lLFxuICAgICAgW3BhZ2VQYXJhbXMucHVibGljU2VydmVyVXJsXTogY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldCwgcGFyYW1zKTtcbiAgfVxuXG4gIHJlcXVlc3RSZXNldFBhc3N3b3JkKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHsgdXNlcm5hbWUsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghdXNlcm5hbWUgfHwgIXRva2VuKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbmZpZy51c2VyQ29udHJvbGxlci5jaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh1c2VybmFtZSwgdG9rZW4pLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHRva2VuLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwbGljYXRpb25JZCxcbiAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldCwgcGFyYW1zKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCwgcGFyYW1zKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgcmVzZXRQYXNzd29yZChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHVzZXJuYW1lLCBuZXdfcGFzc3dvcmQsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLmJvZHk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCghdXNlcm5hbWUgfHwgIXRva2VuIHx8ICFuZXdfcGFzc3dvcmQpICYmIHJlcS54aHIgPT09IGZhbHNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICdNaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuXG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTWlzc2luZyB0b2tlbicpO1xuICAgIH1cblxuICAgIGlmICghbmV3X3Bhc3N3b3JkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ01pc3NpbmcgcGFzc3dvcmQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29uZmlnLnVzZXJDb250cm9sbGVyXG4gICAgICAudXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBuZXdfcGFzc3dvcmQpXG4gICAgICAudGhlbihcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZXJyLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVxLnhocikge1xuICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICAgIHN0YXR1czogMjAwLFxuICAgICAgICAgICAgICByZXNwb25zZTogJ1Bhc3N3b3JkIHN1Y2Nlc3NmdWxseSByZXNldCcsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlc3VsdC5lcnIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYCR7cmVzdWx0LmVycn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBxdWVyeSA9IHJlc3VsdC5zdWNjZXNzXG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgICAgICAgIFtwYWdlUGFyYW1zLnRva2VuXTogdG9rZW4sXG4gICAgICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcElkXTogY29uZmlnLmFwcGxpY2F0aW9uSWQsXG4gICAgICAgICAgICAgIFtwYWdlUGFyYW1zLmVycm9yXTogcmVzdWx0LmVycixcbiAgICAgICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgY29uc3QgcGFnZSA9IHJlc3VsdC5zdWNjZXNzID8gcGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgOiBwYWdlcy5wYXNzd29yZFJlc2V0O1xuXG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZSwgcXVlcnksIGZhbHNlKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgcGFnZSBjb250ZW50IGlmIHRoZSBwYWdlIGlzIGEgbG9jYWwgZmlsZSBvciByZXR1cm5zIGFcbiAgICogcmVkaXJlY3QgdG8gYSBjdXN0b20gcGFnZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge1BhZ2V9IHBhZ2UgVGhlIHBhZ2UgdG8gZ28gdG8uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGFyYW1zPXt9XSBUaGUgcXVlcnkgcGFyYW1ldGVycyB0byBhdHRhY2ggdG8gdGhlIFVSTCBpbiBjYXNlIG9mXG4gICAqIEhUVFAgcmVkaXJlY3QgcmVzcG9uc2VzIGZvciBQT1NUIHJlcXVlc3RzLCBvciB0aGUgcGxhY2Vob2xkZXJzIHRvIGZpbGwgaW50b1xuICAgKiB0aGUgcmVzcG9uc2UgY29udGVudCBpbiBjYXNlIG9mIEhUVFAgY29udGVudCByZXNwb25zZXMgZm9yIEdFVCByZXF1ZXN0cy5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbcmVzcG9uc2VUeXBlXSBJcyB0cnVlIGlmIGEgcmVkaXJlY3QgcmVzcG9uc2Ugc2hvdWxkIGJlIGZvcmNlZCxcbiAgICogZmFsc2UgaWYgYSBjb250ZW50IHJlc3BvbnNlIHNob3VsZCBiZSBmb3JjZWQsIHVuZGVmaW5lZCBpZiB0aGUgcmVzcG9uc2UgdHlwZVxuICAgKiBzaG91bGQgZGVwZW5kIG9uIHRoZSByZXF1ZXN0IHR5cGUgYnkgZGVmYXVsdDpcbiAgICogLSBHRVQgcmVxdWVzdCAtPiBjb250ZW50IHJlc3BvbnNlXG4gICAqIC0gUE9TVCByZXF1ZXN0IC0+IHJlZGlyZWN0IHJlc3BvbnNlIChQUkcgcGF0dGVybilcbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIFByb21pc2VSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBnb1RvUGFnZShyZXEsIHBhZ2UsIHBhcmFtcyA9IHt9LCByZXNwb25zZVR5cGUpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHJlZGlyZWN0IGVpdGhlciBieSBmb3JjZSwgcmVzcG9uc2Ugc2V0dGluZyBvciByZXF1ZXN0IG1ldGhvZFxuICAgIGNvbnN0IHJlZGlyZWN0ID0gY29uZmlnLnBhZ2VzLmZvcmNlUmVkaXJlY3RcbiAgICAgID8gdHJ1ZVxuICAgICAgOiByZXNwb25zZVR5cGUgIT09IHVuZGVmaW5lZFxuICAgICAgPyByZXNwb25zZVR5cGVcbiAgICAgIDogcmVxLm1ldGhvZCA9PSAnUE9TVCc7XG5cbiAgICAvLyBJbmNsdWRlIGRlZmF1bHQgcGFyYW1ldGVyc1xuICAgIGNvbnN0IGRlZmF1bHRQYXJhbXMgPSB0aGlzLmdldERlZmF1bHRQYXJhbXMoY29uZmlnKTtcbiAgICBpZiAoT2JqZWN0LnZhbHVlcyhkZWZhdWx0UGFyYW1zKS5pbmNsdWRlcyh1bmRlZmluZWQpKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZCgpO1xuICAgIH1cbiAgICBwYXJhbXMgPSBPYmplY3QuYXNzaWduKHBhcmFtcywgZGVmYXVsdFBhcmFtcyk7XG5cbiAgICAvLyBBZGQgbG9jYWxlIHRvIHBhcmFtcyB0byBlbnN1cmUgaXQgaXMgcGFzc2VkIG9uIHdpdGggZXZlcnkgcmVxdWVzdDtcbiAgICAvLyB0aGF0IG1lYW5zLCBvbmNlIGEgbG9jYWxlIGlzIHNldCwgaXQgaXMgcGFzc2VkIG9uIHRvIGFueSBmb2xsb3ctdXAgcGFnZSxcbiAgICAvLyBlLmcuIHJlcXVlc3RfcGFzc3dvcmRfcmVzZXQgLT4gcGFzc3dvcmRfcmVzZXQgLT4gcGFzc3dvcmRfcmVzZXRfc3VjY2Vzc1xuICAgIGNvbnN0IGxvY2FsZSA9IHRoaXMuZ2V0TG9jYWxlKHJlcSk7XG4gICAgcGFyYW1zW3BhZ2VQYXJhbXMubG9jYWxlXSA9IGxvY2FsZTtcblxuICAgIC8vIENvbXBvc2UgcGF0aHMgYW5kIFVSTHNcbiAgICBjb25zdCBkZWZhdWx0RmlsZSA9IHBhZ2UuZGVmYXVsdEZpbGU7XG4gICAgY29uc3QgZGVmYXVsdFBhdGggPSB0aGlzLmRlZmF1bHRQYWdlUGF0aChkZWZhdWx0RmlsZSk7XG4gICAgY29uc3QgZGVmYXVsdFVybCA9IHRoaXMuY29tcG9zZVBhZ2VVcmwoZGVmYXVsdEZpbGUsIGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwpO1xuXG4gICAgLy8gSWYgY3VzdG9tIFVSTCBpcyBzZXQgcmVkaXJlY3QgdG8gaXQgd2l0aG91dCBsb2NhbGl6YXRpb25cbiAgICBjb25zdCBjdXN0b21VcmwgPSBjb25maWcucGFnZXMuY3VzdG9tVXJsc1twYWdlLmlkXTtcbiAgICBpZiAoY3VzdG9tVXJsICYmICFVdGlscy5pc1BhdGgoY3VzdG9tVXJsKSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RSZXNwb25zZShjdXN0b21VcmwsIHBhcmFtcyk7XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgbGV0IHBsYWNlaG9sZGVycyA9IHt9O1xuICAgIGlmIChjb25maWcucGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uICYmIGNvbmZpZy5wYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkge1xuICAgICAgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zKTtcbiAgICB9XG5cbiAgICAvLyBTZW5kIHJlc3BvbnNlXG4gICAgaWYgKGNvbmZpZy5wYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gJiYgbG9jYWxlKSB7XG4gICAgICByZXR1cm4gVXRpbHMuZ2V0TG9jYWxpemVkUGF0aChkZWZhdWx0UGF0aCwgbG9jYWxlKS50aGVuKCh7IHBhdGgsIHN1YmRpciB9KSA9PlxuICAgICAgICByZWRpcmVjdFxuICAgICAgICAgID8gdGhpcy5yZWRpcmVjdFJlc3BvbnNlKFxuICAgICAgICAgICAgICB0aGlzLmNvbXBvc2VQYWdlVXJsKGRlZmF1bHRGaWxlLCBjb25maWcucHVibGljU2VydmVyVVJMLCBzdWJkaXIpLFxuICAgICAgICAgICAgICBwYXJhbXNcbiAgICAgICAgICAgIClcbiAgICAgICAgICA6IHRoaXMucGFnZVJlc3BvbnNlKHBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHJlZGlyZWN0XG4gICAgICAgID8gdGhpcy5yZWRpcmVjdFJlc3BvbnNlKGRlZmF1bHRVcmwsIHBhcmFtcylcbiAgICAgICAgOiB0aGlzLnBhZ2VSZXNwb25zZShkZWZhdWx0UGF0aCwgcGFyYW1zLCBwbGFjZWhvbGRlcnMpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZXJ2ZXMgYSByZXF1ZXN0IHRvIGEgc3RhdGljIHJlc291cmNlIGFuZCBsb2NhbGl6ZXMgdGhlIHJlc291cmNlIGlmIGl0XG4gICAqIGlzIGEgSFRNTCBmaWxlLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIHJlc3BvbnNlLlxuICAgKi9cbiAgc3RhdGljUm91dGUocmVxKSB7XG4gICAgLy8gR2V0IHJlcXVlc3RlZCBwYXRoXG4gICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcmVxLnBhcmFtc1swXTtcblxuICAgIC8vIFJlc29sdmUgcmVxdWVzdGVkIHBhdGggdG8gYWJzb2x1dGUgcGF0aFxuICAgIGNvbnN0IGFic29sdXRlUGF0aCA9IHBhdGgucmVzb2x2ZSh0aGlzLnBhZ2VzUGF0aCwgcmVsYXRpdmVQYXRoKTtcblxuICAgIC8vIElmIHRoZSByZXF1ZXN0ZWQgZmlsZSBpcyBub3QgYSBIVE1MIGZpbGUgc2VuZCBpdHMgcmF3IGNvbnRlbnRcbiAgICBpZiAoIWFic29sdXRlUGF0aCB8fCAhYWJzb2x1dGVQYXRoLmVuZHNXaXRoKCcuaHRtbCcpKSB7XG4gICAgICByZXR1cm4gdGhpcy5maWxlUmVzcG9uc2UoYWJzb2x1dGVQYXRoKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgcGFyYW1ldGVyc1xuICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMuZ2V0RGVmYXVsdFBhcmFtcyhyZXEuY29uZmlnKTtcbiAgICBjb25zdCBsb2NhbGUgPSB0aGlzLmdldExvY2FsZShyZXEpO1xuICAgIGlmIChsb2NhbGUpIHtcbiAgICAgIHBhcmFtcy5sb2NhbGUgPSBsb2NhbGU7XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgY29uc3QgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zKTtcblxuICAgIHJldHVybiB0aGlzLnBhZ2VSZXNwb25zZShhYnNvbHV0ZVBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgdHJhbnNsYXRpb24gZnJvbSB0aGUgSlNPTiByZXNvdXJjZSBmb3IgYSBnaXZlbiBsb2NhbGUuIFRoZSBKU09OXG4gICAqIHJlc291cmNlIGlzIHBhcnNlZCBhY2NvcmRpbmcgdG8gaTE4bmV4dCBzeW50YXguXG4gICAqXG4gICAqIEV4YW1wbGUgSlNPTiBjb250ZW50OlxuICAgKiBgYGBqc1xuICAgKiAge1xuICAgKiAgICBcImVuXCI6IHsgICAgICAgICAgICAgICAvLyByZXNvdXJjZSBmb3IgbGFuZ3VhZ2UgYGVuYCAoRW5nbGlzaClcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJIZWxsbyFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfSxcbiAgICogICAgXCJkZVwiOiB7ICAgICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxhbmd1YWdlIGBkZWAgKEdlcm1hbilcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJIYWxsbyFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfVxuICAgKiAgICBcImRlLUNIXCI6IHsgICAgICAgICAgICAvLyByZXNvdXJjZSBmb3IgbG9jYWxlIGBkZS1DSGAgKFN3aXNzIEdlcm1hbilcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJHcsO8ZXppIVwiXG4gICAqICAgICAgfVxuICAgKiAgICB9XG4gICAqICB9XG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUgdG8gdHJhbnNsYXRlIHRvLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgdHJhbnNsYXRpb24gb3IgYW4gZW1wdHkgb2JqZWN0IGlmIG5vIG1hdGNoaW5nXG4gICAqIHRyYW5zbGF0aW9uIHdhcyBmb3VuZC5cbiAgICovXG4gIGdldEpzb25UcmFuc2xhdGlvbihsb2NhbGUpIHtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBKU09OIHJlc291cmNlXG4gICAgaWYgKHRoaXMuanNvblBhcmFtZXRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cblxuICAgIC8vIElmIGxvY2FsZSBpcyBub3Qgc2V0IHVzZSB0aGUgZmFsbGJhY2sgbG9jYWxlXG4gICAgbG9jYWxlID0gbG9jYWxlIHx8IHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGU7XG5cbiAgICAvLyBHZXQgbWF0Y2hpbmcgdHJhbnNsYXRpb24gYnkgbG9jYWxlLCBsYW5ndWFnZSBvciBmYWxsYmFjayBsb2NhbGVcbiAgICBjb25zdCBsYW5ndWFnZSA9IGxvY2FsZS5zcGxpdCgnLScpWzBdO1xuICAgIGNvbnN0IHJlc291cmNlID1cbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbbG9jYWxlXSB8fFxuICAgICAgdGhpcy5qc29uUGFyYW1ldGVyc1tsYW5ndWFnZV0gfHxcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZV0gfHxcbiAgICAgIHt9O1xuICAgIGNvbnN0IHRyYW5zbGF0aW9uID0gcmVzb3VyY2UudHJhbnNsYXRpb24gfHwge307XG4gICAgcmV0dXJuIHRyYW5zbGF0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSB0cmFuc2xhdGlvbiBmcm9tIHRoZSBKU09OIHJlc291cmNlIGZvciBhIGdpdmVuIGxvY2FsZSB3aXRoXG4gICAqIHBsYWNlaG9sZGVycyBmaWxsZWQgaW4gYnkgZ2l2ZW4gcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlIHRvIHRyYW5zbGF0ZSB0by5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycyB0byBmaWxsIGludG8gYW55IHBsYWNlaG9sZGVyc1xuICAgKiB3aXRoaW4gdGhlIHRyYW5zbGF0aW9ucy5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHRyYW5zbGF0aW9uIG9yIGFuIGVtcHR5IG9iamVjdCBpZiBubyBtYXRjaGluZ1xuICAgKiB0cmFuc2xhdGlvbiB3YXMgZm91bmQuXG4gICAqL1xuICBnZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zID0ge30pIHtcbiAgICAvLyBJZiBsb2NhbGl6YXRpb24gaXMgZGlzYWJsZWQgb3IgdGhlcmUgaXMgbm8gSlNPTiByZXNvdXJjZVxuICAgIGlmICghdGhpcy5wYWdlc0NvbmZpZy5lbmFibGVMb2NhbGl6YXRpb24gfHwgIXRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGgpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG5cbiAgICAvLyBHZXQgSlNPTiBwbGFjZWhvbGRlcnNcbiAgICBsZXQgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uVHJhbnNsYXRpb24obG9jYWxlKTtcblxuICAgIC8vIEZpbGwgaW4gYW55IHBsYWNlaG9sZGVycyBpbiB0aGUgdHJhbnNsYXRpb247IHRoaXMgYWxsb3dzIGEgdHJhbnNsYXRpb25cbiAgICAvLyB0byBjb250YWluIGRlZmF1bHQgcGxhY2Vob2xkZXJzIGxpa2Uge3thcHBOYW1lfX0gd2hpY2ggYXJlIGZpbGxlZCBoZXJlXG4gICAgcGxhY2Vob2xkZXJzID0gSlNPTi5zdHJpbmdpZnkocGxhY2Vob2xkZXJzKTtcbiAgICBwbGFjZWhvbGRlcnMgPSBtdXN0YWNoZS5yZW5kZXIocGxhY2Vob2xkZXJzLCBwYXJhbXMpO1xuICAgIHBsYWNlaG9sZGVycyA9IEpTT04ucGFyc2UocGxhY2Vob2xkZXJzKTtcblxuICAgIHJldHVybiBwbGFjZWhvbGRlcnM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHJlc3BvbnNlIHdpdGggZmlsZSBjb250ZW50LlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBvZiB0aGUgZmlsZSB0byByZXR1cm4uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGFyYW1zPXt9XSBUaGUgcGFyYW1ldGVycyB0byBiZSBpbmNsdWRlZCBpbiB0aGUgcmVzcG9uc2VcbiAgICogaGVhZGVyLiBUaGVzZSB3aWxsIGFsc28gYmUgdXNlZCB0byBmaWxsIHBsYWNlaG9sZGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtwbGFjZWhvbGRlcnM9e31dIFRoZSBwbGFjZWhvbGRlcnMgdG8gZmlsbCBpbiB0aGUgY29udGVudC5cbiAgICogVGhlc2Ugd2lsbCBub3QgYmUgaW5jbHVkZWQgaW4gdGhlIHJlc3BvbnNlIGhlYWRlci5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIFByb21pc2UgUm91dGVyIHJlc3BvbnNlLlxuICAgKi9cbiAgYXN5bmMgcGFnZVJlc3BvbnNlKHBhdGgsIHBhcmFtcyA9IHt9LCBwbGFjZWhvbGRlcnMgPSB7fSkge1xuICAgIC8vIEdldCBmaWxlIGNvbnRlbnRcbiAgICBsZXQgZGF0YTtcbiAgICB0cnkge1xuICAgICAgZGF0YSA9IGF3YWl0IHRoaXMucmVhZEZpbGUocGF0aCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgY29uZmlnIHBsYWNlaG9sZGVyczsgY2FuIGJlIGFuIG9iamVjdCwgYSBmdW5jdGlvbiBvciBhbiBhc3luYyBmdW5jdGlvblxuICAgIGxldCBjb25maWdQbGFjZWhvbGRlcnMgPVxuICAgICAgdHlwZW9mIHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzID09PSAnZnVuY3Rpb24nXG4gICAgICAgID8gdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnMocGFyYW1zKVxuICAgICAgICA6IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVycykgPT09ICdbb2JqZWN0IE9iamVjdF0nXG4gICAgICAgID8gdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnNcbiAgICAgICAgOiB7fTtcbiAgICBpZiAoY29uZmlnUGxhY2Vob2xkZXJzIGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgY29uZmlnUGxhY2Vob2xkZXJzID0gYXdhaXQgY29uZmlnUGxhY2Vob2xkZXJzO1xuICAgIH1cblxuICAgIC8vIEZpbGwgcGxhY2Vob2xkZXJzXG4gICAgY29uc3QgYWxsUGxhY2Vob2xkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnUGxhY2Vob2xkZXJzLCBwbGFjZWhvbGRlcnMpO1xuICAgIGNvbnN0IHBhcmFtc0FuZFBsYWNlaG9sZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIHBhcmFtcywgYWxsUGxhY2Vob2xkZXJzKTtcbiAgICBkYXRhID0gbXVzdGFjaGUucmVuZGVyKGRhdGEsIHBhcmFtc0FuZFBsYWNlaG9sZGVycyk7XG5cbiAgICAvLyBBZGQgcGxhY2Vob2xkZXJzIGluIGhlYWRlciB0byBhbGxvdyBwYXJzaW5nIGZvciBwcm9ncmFtbWF0aWMgdXNlXG4gICAgLy8gb2YgcmVzcG9uc2UsIGluc3RlYWQgb2YgaGF2aW5nIHRvIHBhcnNlIHRoZSBIVE1MIGNvbnRlbnQuXG4gICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5lbnRyaWVzKHBhcmFtcykucmVkdWNlKChtLCBwKSA9PiB7XG4gICAgICBpZiAocFsxXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIG1bYCR7cGFnZVBhcmFtSGVhZGVyUHJlZml4fSR7cFswXS50b0xvd2VyQ2FzZSgpfWBdID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIHJldHVybiB7IHRleHQ6IGRhdGEsIGhlYWRlcnM6IGhlYWRlcnMgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgcmVzcG9uc2Ugd2l0aCBmaWxlIGNvbnRlbnQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBmaWxlIHRvIHJldHVybi5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIFByb21pc2VSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBhc3luYyBmaWxlUmVzcG9uc2UocGF0aCkge1xuICAgIC8vIEdldCBmaWxlIGNvbnRlbnRcbiAgICBsZXQgZGF0YTtcbiAgICB0cnkge1xuICAgICAgZGF0YSA9IGF3YWl0IHRoaXMucmVhZEZpbGUocGF0aCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyB0ZXh0OiBkYXRhIH07XG4gIH1cblxuICAvKipcbiAgICogUmVhZHMgYW5kIHJldHVybnMgdGhlIGNvbnRlbnQgb2YgYSBmaWxlIGF0IGEgZ2l2ZW4gcGF0aC4gRmlsZSByZWFkaW5nIHRvXG4gICAqIHNlcnZlIGNvbnRlbnQgb24gdGhlIHN0YXRpYyByb3V0ZSBpcyBvbmx5IGFsbG93ZWQgZnJvbSB0aGUgcGFnZXNcbiAgICogZGlyZWN0b3J5IG9uIGRvd253YXJkcy5cbiAgICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICogKipXQVJOSU5HOioqIEFsbCBmaWxlIHJlYWRzIGluIHRoZSBQYWdlc1JvdXRlciBtdXN0IGJlIGV4ZWN1dGVkIGJ5IHRoaXNcbiAgICogd3JhcHBlciBiZWNhdXNlIGl0IGFsc28gZGV0ZWN0cyBhbmQgcHJldmVudHMgY29tbW9uIGV4cGxvaXRzLlxuICAgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgKiBAcGFyYW0ge1N0cmluZ30gZmlsZVBhdGggVGhlIHBhdGggdG8gdGhlIGZpbGUgdG8gcmVhZC5cbiAgICogQHJldHVybnMge1Byb21pc2U8U3RyaW5nPn0gVGhlIGZpbGUgY29udGVudC5cbiAgICovXG4gIGFzeW5jIHJlYWRGaWxlKGZpbGVQYXRoKSB7XG4gICAgLy8gTm9ybWFsaXplIHBhdGggdG8gcHJldmVudCBpdCBmcm9tIGNvbnRhaW5pbmcgYW55IGRpcmVjdG9yeSBjaGFuZ2luZ1xuICAgIC8vIFVOSVggcGF0dGVybnMgd2hpY2ggY291bGQgZXhwb3NlIHRoZSB3aG9sZSBmaWxlIHN5c3RlbSwgZS5nLlxuICAgIC8vIGBodHRwOi8vZXhhbXBsZS5jb20vcGFyc2UvYXBwcy8uLi9maWxlLnR4dGAgcmVxdWVzdHMgYSBmaWxlIG91dHNpZGVcbiAgICAvLyBvZiB0aGUgcGFnZXMgZGlyZWN0b3J5IHNjb3BlLlxuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcGF0aC5ub3JtYWxpemUoZmlsZVBhdGgpO1xuXG4gICAgLy8gQWJvcnQgaWYgdGhlIHBhdGggaXMgb3V0c2lkZSBvZiB0aGUgcGF0aCBkaXJlY3Rvcnkgc2NvcGVcbiAgICBpZiAoIW5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgodGhpcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyBlcnJvcnMuZmlsZU91dHNpZGVBbGxvd2VkU2NvcGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGF3YWl0IGZzLnJlYWRGaWxlKG5vcm1hbGl6ZWRQYXRoLCAndXRmLTgnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2FkcyBhIGxhbmd1YWdlIHJlc291cmNlIEpTT04gZmlsZSB0aGF0IGlzIHVzZWQgZm9yIHRyYW5zbGF0aW9ucy5cbiAgICovXG4gIGxvYWRKc29uUmVzb3VyY2UoKSB7XG4gICAgaWYgKHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QganNvbiA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKCcuLycsIHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGgpKTtcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnMgPSBqc29uO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRocm93IGVycm9ycy5qc29uRmFpbGVkRmlsZUxvYWRpbmc7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEV4dHJhY3RzIGFuZCByZXR1cm5zIHRoZSBwYWdlIGRlZmF1bHQgcGFyYW1ldGVycyBmcm9tIHRoZSBQYXJzZSBTZXJ2ZXJcbiAgICogY29uZmlndXJhdGlvbi4gVGhlc2UgcGFyYW1ldGVycyBhcmUgbWFkZSBhY2Nlc3NpYmxlIGluIGV2ZXJ5IHBhZ2Ugc2VydmVkXG4gICAqIGJ5IHRoaXMgcm91dGVyLlxuICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIGRlZmF1bHQgcGFyYW1ldGVycy5cbiAgICovXG4gIGdldERlZmF1bHRQYXJhbXMoY29uZmlnKSB7XG4gICAgcmV0dXJuIGNvbmZpZ1xuICAgICAgPyB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwSWQsXG4gICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLnB1YmxpY1NlcnZlclVybF06IGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIH1cbiAgICAgIDoge307XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIGxvY2FsZSBmcm9tIGFuIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcmV0dXJucyB7U3RyaW5nfHVuZGVmaW5lZH0gVGhlIGxvY2FsZSwgb3IgdW5kZWZpbmVkIGlmIG5vIGxvY2FsZSB3YXMgc2V0LlxuICAgKi9cbiAgZ2V0TG9jYWxlKHJlcSkge1xuICAgIGNvbnN0IGxvY2FsZSA9XG4gICAgICAocmVxLnF1ZXJ5IHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEuYm9keSB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLnBhcmFtcyB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLmhlYWRlcnMgfHwge30pW3BhZ2VQYXJhbUhlYWRlclByZWZpeCArIHBhZ2VQYXJhbXMubG9jYWxlXTtcbiAgICByZXR1cm4gbG9jYWxlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGh0dHAgcmVkaXJlY3QuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBxdWVyeSBwYXJhbWV0ZXJzIHRvIGluY2x1ZGUuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlIFJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIHJlZGlyZWN0UmVzcG9uc2UodXJsLCBwYXJhbXMpIHtcbiAgICAvLyBSZW1vdmUgYW55IHBhcmFtZXRlcnMgd2l0aCB1bmRlZmluZWQgdmFsdWVcbiAgICBwYXJhbXMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW3BbMF1dID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIENvbXBvc2UgVVJMIHdpdGggcGFyYW1ldGVycyBpbiBxdWVyeVxuICAgIGNvbnN0IGxvY2F0aW9uID0gbmV3IFVSTCh1cmwpO1xuICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtcykuZm9yRWFjaChwID0+IGxvY2F0aW9uLnNlYXJjaFBhcmFtcy5zZXQocFswXSwgcFsxXSkpO1xuICAgIGNvbnN0IGxvY2F0aW9uU3RyaW5nID0gbG9jYXRpb24udG9TdHJpbmcoKTtcblxuICAgIC8vIEFkZCBwYXJhbWV0ZXJzIHRvIGhlYWRlciB0byBhbGxvdyBwYXJzaW5nIGZvciBwcm9ncmFtbWF0aWMgdXNlXG4gICAgLy8gb2YgcmVzcG9uc2UsIGluc3RlYWQgb2YgaGF2aW5nIHRvIHBhcnNlIHRoZSBIVE1MIGNvbnRlbnQuXG4gICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5lbnRyaWVzKHBhcmFtcykucmVkdWNlKChtLCBwKSA9PiB7XG4gICAgICBpZiAocFsxXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIG1bYCR7cGFnZVBhcmFtSGVhZGVyUHJlZml4fSR7cFswXS50b0xvd2VyQ2FzZSgpfWBdID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6IDMwMyxcbiAgICAgIGxvY2F0aW9uOiBsb2NhdGlvblN0cmluZyxcbiAgICAgIGhlYWRlcnM6IGhlYWRlcnMsXG4gICAgfTtcbiAgfVxuXG4gIGRlZmF1bHRQYWdlUGF0aChmaWxlKSB7XG4gICAgcmV0dXJuIHBhdGguam9pbih0aGlzLnBhZ2VzUGF0aCwgZmlsZSk7XG4gIH1cblxuICBjb21wb3NlUGFnZVVybChmaWxlLCBwdWJsaWNTZXJ2ZXJVcmwsIGxvY2FsZSkge1xuICAgIGxldCB1cmwgPSBwdWJsaWNTZXJ2ZXJVcmw7XG4gICAgdXJsICs9IHVybC5lbmRzV2l0aCgnLycpID8gJycgOiAnLyc7XG4gICAgdXJsICs9IHRoaXMucGFnZXNFbmRwb2ludCArICcvJztcbiAgICB1cmwgKz0gbG9jYWxlID09PSB1bmRlZmluZWQgPyAnJyA6IGxvY2FsZSArICcvJztcbiAgICB1cmwgKz0gZmlsZTtcbiAgICByZXR1cm4gdXJsO1xuICB9XG5cbiAgbm90Rm91bmQoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRleHQ6ICdOb3QgZm91bmQuJyxcbiAgICAgIHN0YXR1czogNDA0LFxuICAgIH07XG4gIH1cblxuICBpbnZhbGlkUmVxdWVzdCgpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gaW4gdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIG1ha2UgaXRcbiAgICogZWFzaWx5IGFjY2Vzc2libGUgdGhyb3VnaHRvdXQgcmVxdWVzdCBwcm9jZXNzaW5nLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZhaWxHcmFjZWZ1bGx5IElzIHRydWUgaWYgZmFpbGluZyB0byBzZXQgdGhlIGNvbmZpZyBzaG91bGRcbiAgICogbm90IHJlc3VsdCBpbiBhbiBpbnZhbGlkIHJlcXVlc3QgcmVzcG9uc2UuIERlZmF1bHQgaXMgYGZhbHNlYC5cbiAgICovXG4gIHNldENvbmZpZyhyZXEsIGZhaWxHcmFjZWZ1bGx5ID0gZmFsc2UpIHtcbiAgICByZXEuY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkIHx8IHJlcS5xdWVyeS5hcHBJZCk7XG4gICAgaWYgKCFyZXEuY29uZmlnICYmICFmYWlsR3JhY2VmdWxseSkge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBtb3VudFBhZ2VzUm91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC92ZXJpZnlfZW1haWxgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy52ZXJpZnlFbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3Jlc2VuZF92ZXJpZmljYXRpb25fZW1haWxgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS9jaG9vc2VfcGFzc3dvcmRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXNzd29yZFJlc2V0KHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvcmVxdWVzdF9wYXNzd29yZF9yZXNldGAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc2V0UGFzc3dvcmQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXF1ZXN0UmVzZXRQYXNzd29yZChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBtb3VudEN1c3RvbVJvdXRlcygpIHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMucGFnZXNDb25maWcuY3VzdG9tUm91dGVzIHx8IFtdKSB7XG4gICAgICB0aGlzLnJvdXRlKFxuICAgICAgICByb3V0ZS5tZXRob2QsXG4gICAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC8ke3JvdXRlLnBhdGh9YCxcbiAgICAgICAgcmVxID0+IHtcbiAgICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgICB9LFxuICAgICAgICBhc3luYyByZXEgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgZmlsZSwgcXVlcnkgPSB7fSB9ID0gKGF3YWl0IHJvdXRlLmhhbmRsZXIocmVxKSkgfHwge307XG5cbiAgICAgICAgICAvLyBJZiByb3V0ZSBoYW5kbGVyIGRpZCBub3QgcmV0dXJuIGEgcGFnZSBzZW5kIDQwNCByZXNwb25zZVxuICAgICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBTZW5kIHBhZ2UgcmVzcG9uc2VcbiAgICAgICAgICBjb25zdCBwYWdlID0gbmV3IFBhZ2UoeyBpZDogZmlsZSwgZGVmYXVsdEZpbGU6IGZpbGUgfSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlLCBxdWVyeSwgZmFsc2UpO1xuICAgICAgICB9XG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIG1vdW50U3RhdGljUm91dGUoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vKCopP2AsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEsIHRydWUpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRpY1JvdXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGV4cHJlc3NSb3V0ZXIoKSB7XG4gICAgY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIudXNlKCcvJywgc3VwZXIuZXhwcmVzc1JvdXRlcigpKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhZ2VzUm91dGVyO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIFBhZ2VzUm91dGVyLFxuICBwYWdlUGFyYW1IZWFkZXJQcmVmaXgsXG4gIHBhZ2VQYXJhbXMsXG4gIHBhZ2VzLFxufTtcbiJdfQ==