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
    // e.g. request_password_reset -> password_reset -> passwort_reset_success

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
   * Creates a response with http rediret.
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1BhZ2VzUm91dGVyLmpzIl0sIm5hbWVzIjpbInBhZ2VzIiwiT2JqZWN0IiwiZnJlZXplIiwicGFzc3dvcmRSZXNldCIsIlBhZ2UiLCJpZCIsImRlZmF1bHRGaWxlIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXNzd29yZFJlc2V0TGlua0ludmFsaWQiLCJlbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3MiLCJlbWFpbFZlcmlmaWNhdGlvblNlbmRGYWlsIiwiZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzcyIsImVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQiLCJlbWFpbFZlcmlmaWNhdGlvbkxpbmtFeHBpcmVkIiwicGFnZVBhcmFtcyIsImFwcE5hbWUiLCJhcHBJZCIsInRva2VuIiwidXNlcm5hbWUiLCJlcnJvciIsImxvY2FsZSIsInB1YmxpY1NlcnZlclVybCIsInBhZ2VQYXJhbUhlYWRlclByZWZpeCIsImVycm9ycyIsImpzb25GYWlsZWRGaWxlTG9hZGluZyIsImZpbGVPdXRzaWRlQWxsb3dlZFNjb3BlIiwiUGFnZXNSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwiY29uc3RydWN0b3IiLCJwYWdlc0NvbmZpZyIsInBhZ2VzRW5kcG9pbnQiLCJwYWdlc1BhdGgiLCJwYXRoIiwicmVzb2x2ZSIsIl9fZGlybmFtZSIsImxvYWRKc29uUmVzb3VyY2UiLCJtb3VudFBhZ2VzUm91dGVzIiwidmVyaWZ5RW1haWwiLCJyZXEiLCJjb25maWciLCJyYXdUb2tlbiIsInF1ZXJ5IiwidG9TdHJpbmciLCJpbnZhbGlkUmVxdWVzdCIsImdvVG9QYWdlIiwidXNlckNvbnRyb2xsZXIiLCJ0aGVuIiwicGFyYW1zIiwicmVzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJib2R5IiwicHVibGljU2VydmVyVVJMIiwicmVxdWVzdFJlc2V0UGFzc3dvcmQiLCJjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSIsImFwcGxpY2F0aW9uSWQiLCJyZXNldFBhc3N3b3JkIiwibmV3X3Bhc3N3b3JkIiwieGhyIiwiUGFyc2UiLCJFcnJvciIsIlVTRVJOQU1FX01JU1NJTkciLCJPVEhFUl9DQVVTRSIsIlBBU1NXT1JEX01JU1NJTkciLCJ1cGRhdGVQYXNzd29yZCIsIlByb21pc2UiLCJzdWNjZXNzIiwiZXJyIiwicmVzdWx0Iiwic3RhdHVzIiwicmVzcG9uc2UiLCJwYWdlIiwicmVzcG9uc2VUeXBlIiwicmVkaXJlY3QiLCJmb3JjZVJlZGlyZWN0IiwidW5kZWZpbmVkIiwibWV0aG9kIiwiZGVmYXVsdFBhcmFtcyIsImdldERlZmF1bHRQYXJhbXMiLCJ2YWx1ZXMiLCJpbmNsdWRlcyIsIm5vdEZvdW5kIiwiYXNzaWduIiwiZ2V0TG9jYWxlIiwiZGVmYXVsdFBhdGgiLCJkZWZhdWx0UGFnZVBhdGgiLCJkZWZhdWx0VXJsIiwiY29tcG9zZVBhZ2VVcmwiLCJjdXN0b21VcmwiLCJjdXN0b21VcmxzIiwiVXRpbHMiLCJpc1BhdGgiLCJyZWRpcmVjdFJlc3BvbnNlIiwicGxhY2Vob2xkZXJzIiwiZW5hYmxlTG9jYWxpemF0aW9uIiwibG9jYWxpemF0aW9uSnNvblBhdGgiLCJnZXRKc29uUGxhY2Vob2xkZXJzIiwiZ2V0TG9jYWxpemVkUGF0aCIsInN1YmRpciIsInBhZ2VSZXNwb25zZSIsInN0YXRpY1JvdXRlIiwicmVsYXRpdmVQYXRoIiwiYWJzb2x1dGVQYXRoIiwiZW5kc1dpdGgiLCJmaWxlUmVzcG9uc2UiLCJnZXRKc29uVHJhbnNsYXRpb24iLCJqc29uUGFyYW1ldGVycyIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwibGFuZ3VhZ2UiLCJzcGxpdCIsInJlc291cmNlIiwidHJhbnNsYXRpb24iLCJKU09OIiwic3RyaW5naWZ5IiwibXVzdGFjaGUiLCJyZW5kZXIiLCJwYXJzZSIsImRhdGEiLCJyZWFkRmlsZSIsImUiLCJjb25maWdQbGFjZWhvbGRlcnMiLCJwcm90b3R5cGUiLCJjYWxsIiwiYWxsUGxhY2Vob2xkZXJzIiwicGFyYW1zQW5kUGxhY2Vob2xkZXJzIiwiaGVhZGVycyIsImVudHJpZXMiLCJyZWR1Y2UiLCJtIiwicCIsInRvTG93ZXJDYXNlIiwidGV4dCIsImZpbGVQYXRoIiwibm9ybWFsaXplZFBhdGgiLCJub3JtYWxpemUiLCJzdGFydHNXaXRoIiwiZnMiLCJqc29uIiwicmVxdWlyZSIsInVybCIsImxvY2F0aW9uIiwiVVJMIiwiZm9yRWFjaCIsInNlYXJjaFBhcmFtcyIsInNldCIsImxvY2F0aW9uU3RyaW5nIiwiZmlsZSIsImpvaW4iLCJtZXNzYWdlIiwic2V0Q29uZmlnIiwiZmFpbEdyYWNlZnVsbHkiLCJDb25maWciLCJnZXQiLCJyb3V0ZSIsImV4cHJlc3NSb3V0ZXIiLCJyb3V0ZXIiLCJleHByZXNzIiwiUm91dGVyIiwidXNlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7O0FBRUE7QUFDQSxNQUFNQSxLQUFLLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjO0FBQzFCQyxFQUFBQSxhQUFhLEVBQUUsSUFBSUMsYUFBSixDQUFTO0FBQUVDLElBQUFBLEVBQUUsRUFBRSxlQUFOO0FBQXVCQyxJQUFBQSxXQUFXLEVBQUU7QUFBcEMsR0FBVCxDQURXO0FBRTFCQyxFQUFBQSxvQkFBb0IsRUFBRSxJQUFJSCxhQUFKLENBQVM7QUFDN0JDLElBQUFBLEVBQUUsRUFBRSxzQkFEeUI7QUFFN0JDLElBQUFBLFdBQVcsRUFBRTtBQUZnQixHQUFULENBRkk7QUFNMUJFLEVBQUFBLHdCQUF3QixFQUFFLElBQUlKLGFBQUosQ0FBUztBQUNqQ0MsSUFBQUEsRUFBRSxFQUFFLDBCQUQ2QjtBQUVqQ0MsSUFBQUEsV0FBVyxFQUFFO0FBRm9CLEdBQVQsQ0FOQTtBQVUxQkcsRUFBQUEsd0JBQXdCLEVBQUUsSUFBSUwsYUFBSixDQUFTO0FBQ2pDQyxJQUFBQSxFQUFFLEVBQUUsMEJBRDZCO0FBRWpDQyxJQUFBQSxXQUFXLEVBQUU7QUFG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Qy9ILFc7O0FBQ2ZtSSxNQUFNLENBQUNDLE9BQVAsR0FBaUI7QUFDZnBJLEVBQUFBLFdBRGU7QUFFZkosRUFBQUEscUJBRmU7QUFHZlIsRUFBQUEsVUFIZTtBQUlmZCxFQUFBQTtBQUplLENBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzZXMgYXMgZnMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCBtdXN0YWNoZSBmcm9tICdtdXN0YWNoZSc7XG5pbXBvcnQgUGFnZSBmcm9tICcuLi9QYWdlJztcblxuLy8gQWxsIHBhZ2VzIHdpdGggY3VzdG9tIHBhZ2Uga2V5IGZvciByZWZlcmVuY2UgYW5kIGZpbGUgbmFtZVxuY29uc3QgcGFnZXMgPSBPYmplY3QuZnJlZXplKHtcbiAgcGFzc3dvcmRSZXNldDogbmV3IFBhZ2UoeyBpZDogJ3Bhc3N3b3JkUmVzZXQnLCBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0Lmh0bWwnIH0pLFxuICBwYXNzd29yZFJlc2V0U3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAncGFzc3dvcmRSZXNldFN1Y2Nlc3MnLFxuICAgIGRlZmF1bHRGaWxlOiAncGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIHBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAncGFzc3dvcmRSZXNldExpbmtJbnZhbGlkJyxcbiAgICBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0X2xpbmtfaW52YWxpZC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TdWNjZXNzJyxcbiAgICBkZWZhdWx0RmlsZTogJ2VtYWlsX3ZlcmlmaWNhdGlvbl9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc2VuZF9mYWlsLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzcycsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc2VuZF9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fbGlua19pbnZhbGlkLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fbGlua19leHBpcmVkLmh0bWwnLFxuICB9KSxcbn0pO1xuXG4vLyBBbGwgcGFnZSBwYXJhbWV0ZXJzIGZvciByZWZlcmVuY2UgdG8gYmUgdXNlZCBhcyB0ZW1wbGF0ZSBwbGFjZWhvbGRlcnMgb3IgcXVlcnkgcGFyYW1zXG5jb25zdCBwYWdlUGFyYW1zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGFwcE5hbWU6ICdhcHBOYW1lJyxcbiAgYXBwSWQ6ICdhcHBJZCcsXG4gIHRva2VuOiAndG9rZW4nLFxuICB1c2VybmFtZTogJ3VzZXJuYW1lJyxcbiAgZXJyb3I6ICdlcnJvcicsXG4gIGxvY2FsZTogJ2xvY2FsZScsXG4gIHB1YmxpY1NlcnZlclVybDogJ3B1YmxpY1NlcnZlclVybCcsXG59KTtcblxuLy8gVGhlIGhlYWRlciBwcmVmaXggdG8gYWRkIHBhZ2UgcGFyYW1zIGFzIHJlc3BvbnNlIGhlYWRlcnNcbmNvbnN0IHBhZ2VQYXJhbUhlYWRlclByZWZpeCA9ICd4LXBhcnNlLXBhZ2UtcGFyYW0tJztcblxuLy8gVGhlIGVycm9ycyBiZWluZyB0aHJvd25cbmNvbnN0IGVycm9ycyA9IE9iamVjdC5mcmVlemUoe1xuICBqc29uRmFpbGVkRmlsZUxvYWRpbmc6ICdmYWlsZWQgdG8gbG9hZCBKU09OIGZpbGUnLFxuICBmaWxlT3V0c2lkZUFsbG93ZWRTY29wZTogJ25vdCBhbGxvd2VkIHRvIHJlYWQgZmlsZSBvdXRzaWRlIG9mIHBhZ2VzIGRpcmVjdG9yeScsXG59KTtcblxuZXhwb3J0IGNsYXNzIFBhZ2VzUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIC8qKlxuICAgKiBDb25zdHJ1Y3RzIGEgUGFnZXNSb3V0ZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYWdlcyBUaGUgcGFnZXMgb3B0aW9ucyBmcm9tIHRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHBhZ2VzID0ge30pIHtcbiAgICBzdXBlcigpO1xuXG4gICAgLy8gU2V0IGluc3RhbmNlIHByb3BlcnRpZXNcbiAgICB0aGlzLnBhZ2VzQ29uZmlnID0gcGFnZXM7XG4gICAgdGhpcy5wYWdlc0VuZHBvaW50ID0gcGFnZXMucGFnZXNFbmRwb2ludCA/IHBhZ2VzLnBhZ2VzRW5kcG9pbnQgOiAnYXBwcyc7XG4gICAgdGhpcy5wYWdlc1BhdGggPSBwYWdlcy5wYWdlc1BhdGhcbiAgICAgID8gcGF0aC5yZXNvbHZlKCcuLycsIHBhZ2VzLnBhZ2VzUGF0aClcbiAgICAgIDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3B1YmxpYycpO1xuICAgIHRoaXMubG9hZEpzb25SZXNvdXJjZSgpO1xuICAgIHRoaXMubW91bnRQYWdlc1JvdXRlcygpO1xuICB9XG5cbiAgdmVyaWZ5RW1haWwocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB7IHVzZXJuYW1lLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5xdWVyeTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGlmICghdG9rZW4gfHwgIXVzZXJuYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci52ZXJpZnlFbWFpbCh1c2VybmFtZSwgdG9rZW4pLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uU3VjY2VzcywgcGFyYW1zKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQsIHBhcmFtcyk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgdXNlcm5hbWUgPSByZXEuYm9keS51c2VybmFtZTtcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHBhc3N3b3JkUmVzZXQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IHJlcS5wYXJhbXMuYXBwSWQsXG4gICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHJlcS5xdWVyeS50b2tlbixcbiAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogcmVxLnF1ZXJ5LnVzZXJuYW1lLFxuICAgICAgW3BhZ2VQYXJhbXMucHVibGljU2VydmVyVXJsXTogY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldCwgcGFyYW1zKTtcbiAgfVxuXG4gIHJlcXVlc3RSZXNldFBhc3N3b3JkKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHsgdXNlcm5hbWUsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghdXNlcm5hbWUgfHwgIXRva2VuKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbmZpZy51c2VyQ29udHJvbGxlci5jaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh1c2VybmFtZSwgdG9rZW4pLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHRva2VuLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwbGljYXRpb25JZCxcbiAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldCwgcGFyYW1zKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCwgcGFyYW1zKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgcmVzZXRQYXNzd29yZChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHVzZXJuYW1lLCBuZXdfcGFzc3dvcmQsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLmJvZHk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCghdXNlcm5hbWUgfHwgIXRva2VuIHx8ICFuZXdfcGFzc3dvcmQpICYmIHJlcS54aHIgPT09IGZhbHNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICdNaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuXG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTWlzc2luZyB0b2tlbicpO1xuICAgIH1cblxuICAgIGlmICghbmV3X3Bhc3N3b3JkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ01pc3NpbmcgcGFzc3dvcmQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29uZmlnLnVzZXJDb250cm9sbGVyXG4gICAgICAudXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBuZXdfcGFzc3dvcmQpXG4gICAgICAudGhlbihcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZXJyLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVxLnhocikge1xuICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICAgIHN0YXR1czogMjAwLFxuICAgICAgICAgICAgICByZXNwb25zZTogJ1Bhc3N3b3JkIHN1Y2Nlc3NmdWxseSByZXNldCcsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlc3VsdC5lcnIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYCR7cmVzdWx0LmVycn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBxdWVyeSA9IHJlc3VsdC5zdWNjZXNzXG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICAgIH1cbiAgICAgICAgICA6IHtcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHRva2VuLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwbGljYXRpb25JZCxcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLmVycm9yXTogcmVzdWx0LmVycixcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICBjb25zdCBwYWdlID0gcmVzdWx0LnN1Y2Nlc3MgPyBwYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyA6IHBhZ2VzLnBhc3N3b3JkUmVzZXQ7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlLCBxdWVyeSwgZmFsc2UpO1xuICAgICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBwYWdlIGNvbnRlbnQgaWYgdGhlIHBhZ2UgaXMgYSBsb2NhbCBmaWxlIG9yIHJldHVybnMgYVxuICAgKiByZWRpcmVjdCB0byBhIGN1c3RvbSBwYWdlLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSBleHByZXNzIHJlcXVlc3QuXG4gICAqIEBwYXJhbSB7UGFnZX0gcGFnZSBUaGUgcGFnZSB0byBnbyB0by5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtwYXJhbXM9e31dIFRoZSBxdWVyeSBwYXJhbWV0ZXJzIHRvIGF0dGFjaCB0byB0aGUgVVJMIGluIGNhc2Ugb2ZcbiAgICogSFRUUCByZWRpcmVjdCByZXNwb25zZXMgZm9yIFBPU1QgcmVxdWVzdHMsIG9yIHRoZSBwbGFjZWhvbGRlcnMgdG8gZmlsbCBpbnRvXG4gICAqIHRoZSByZXNwb25zZSBjb250ZW50IGluIGNhc2Ugb2YgSFRUUCBjb250ZW50IHJlc3BvbnNlcyBmb3IgR0VUIHJlcXVlc3RzLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtyZXNwb25zZVR5cGVdIElzIHRydWUgaWYgYSByZWRpcmVjdCByZXNwb25zZSBzaG91bGQgYmUgZm9yY2VkLFxuICAgKiBmYWxzZSBpZiBhIGNvbnRlbnQgcmVzcG9uc2Ugc2hvdWxkIGJlIGZvcmNlZCwgdW5kZWZpbmVkIGlmIHRoZSByZXNwb25zZSB0eXBlXG4gICAqIHNob3VsZCBkZXBlbmQgb24gdGhlIHJlcXVlc3QgdHlwZSBieSBkZWZhdWx0OlxuICAgKiAtIEdFVCByZXF1ZXN0IC0+IGNvbnRlbnQgcmVzcG9uc2VcbiAgICogLSBQT1NUIHJlcXVlc3QgLT4gcmVkaXJlY3QgcmVzcG9uc2UgKFBSRyBwYXR0ZXJuKVxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBUaGUgUHJvbWlzZVJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGdvVG9QYWdlKHJlcSwgcGFnZSwgcGFyYW1zID0ge30sIHJlc3BvbnNlVHlwZSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG5cbiAgICAvLyBEZXRlcm1pbmUgcmVkaXJlY3QgZWl0aGVyIGJ5IGZvcmNlLCByZXNwb25zZSBzZXR0aW5nIG9yIHJlcXVlc3QgbWV0aG9kXG4gICAgY29uc3QgcmVkaXJlY3QgPSBjb25maWcucGFnZXMuZm9yY2VSZWRpcmVjdFxuICAgICAgPyB0cnVlXG4gICAgICA6IHJlc3BvbnNlVHlwZSAhPT0gdW5kZWZpbmVkXG4gICAgICAgID8gcmVzcG9uc2VUeXBlXG4gICAgICAgIDogcmVxLm1ldGhvZCA9PSAnUE9TVCc7XG5cbiAgICAvLyBJbmNsdWRlIGRlZmF1bHQgcGFyYW1ldGVyc1xuICAgIGNvbnN0IGRlZmF1bHRQYXJhbXMgPSB0aGlzLmdldERlZmF1bHRQYXJhbXMoY29uZmlnKTtcbiAgICBpZiAoT2JqZWN0LnZhbHVlcyhkZWZhdWx0UGFyYW1zKS5pbmNsdWRlcyh1bmRlZmluZWQpKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZCgpO1xuICAgIH1cbiAgICBwYXJhbXMgPSBPYmplY3QuYXNzaWduKHBhcmFtcywgZGVmYXVsdFBhcmFtcyk7XG5cbiAgICAvLyBBZGQgbG9jYWxlIHRvIHBhcmFtcyB0byBlbnN1cmUgaXQgaXMgcGFzc2VkIG9uIHdpdGggZXZlcnkgcmVxdWVzdDtcbiAgICAvLyB0aGF0IG1lYW5zLCBvbmNlIGEgbG9jYWxlIGlzIHNldCwgaXQgaXMgcGFzc2VkIG9uIHRvIGFueSBmb2xsb3ctdXAgcGFnZSxcbiAgICAvLyBlLmcuIHJlcXVlc3RfcGFzc3dvcmRfcmVzZXQgLT4gcGFzc3dvcmRfcmVzZXQgLT4gcGFzc3dvcnRfcmVzZXRfc3VjY2Vzc1xuICAgIGNvbnN0IGxvY2FsZSA9IHRoaXMuZ2V0TG9jYWxlKHJlcSk7XG4gICAgcGFyYW1zW3BhZ2VQYXJhbXMubG9jYWxlXSA9IGxvY2FsZTtcblxuICAgIC8vIENvbXBvc2UgcGF0aHMgYW5kIFVSTHNcbiAgICBjb25zdCBkZWZhdWx0RmlsZSA9IHBhZ2UuZGVmYXVsdEZpbGU7XG4gICAgY29uc3QgZGVmYXVsdFBhdGggPSB0aGlzLmRlZmF1bHRQYWdlUGF0aChkZWZhdWx0RmlsZSk7XG4gICAgY29uc3QgZGVmYXVsdFVybCA9IHRoaXMuY29tcG9zZVBhZ2VVcmwoZGVmYXVsdEZpbGUsIGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwpO1xuXG4gICAgLy8gSWYgY3VzdG9tIFVSTCBpcyBzZXQgcmVkaXJlY3QgdG8gaXQgd2l0aG91dCBsb2NhbGl6YXRpb25cbiAgICBjb25zdCBjdXN0b21VcmwgPSBjb25maWcucGFnZXMuY3VzdG9tVXJsc1twYWdlLmlkXTtcbiAgICBpZiAoY3VzdG9tVXJsICYmICFVdGlscy5pc1BhdGgoY3VzdG9tVXJsKSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RSZXNwb25zZShjdXN0b21VcmwsIHBhcmFtcyk7XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgbGV0IHBsYWNlaG9sZGVycyA9IHt9O1xuICAgIGlmIChjb25maWcucGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uICYmIGNvbmZpZy5wYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkge1xuICAgICAgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zKTtcbiAgICB9XG5cbiAgICAvLyBTZW5kIHJlc3BvbnNlXG4gICAgaWYgKGNvbmZpZy5wYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gJiYgbG9jYWxlKSB7XG4gICAgICByZXR1cm4gVXRpbHMuZ2V0TG9jYWxpemVkUGF0aChkZWZhdWx0UGF0aCwgbG9jYWxlKS50aGVuKCh7IHBhdGgsIHN1YmRpciB9KSA9PlxuICAgICAgICByZWRpcmVjdFxuICAgICAgICAgID8gdGhpcy5yZWRpcmVjdFJlc3BvbnNlKFxuICAgICAgICAgICAgdGhpcy5jb21wb3NlUGFnZVVybChkZWZhdWx0RmlsZSwgY29uZmlnLnB1YmxpY1NlcnZlclVSTCwgc3ViZGlyKSxcbiAgICAgICAgICAgIHBhcmFtc1xuICAgICAgICAgIClcbiAgICAgICAgICA6IHRoaXMucGFnZVJlc3BvbnNlKHBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHJlZGlyZWN0XG4gICAgICAgID8gdGhpcy5yZWRpcmVjdFJlc3BvbnNlKGRlZmF1bHRVcmwsIHBhcmFtcylcbiAgICAgICAgOiB0aGlzLnBhZ2VSZXNwb25zZShkZWZhdWx0UGF0aCwgcGFyYW1zLCBwbGFjZWhvbGRlcnMpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZXJ2ZXMgYSByZXF1ZXN0IHRvIGEgc3RhdGljIHJlc291cmNlIGFuZCBsb2NhbGl6ZXMgdGhlIHJlc291cmNlIGlmIGl0XG4gICAqIGlzIGEgSFRNTCBmaWxlLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIHJlc3BvbnNlLlxuICAgKi9cbiAgc3RhdGljUm91dGUocmVxKSB7XG4gICAgLy8gR2V0IHJlcXVlc3RlZCBwYXRoXG4gICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcmVxLnBhcmFtc1swXTtcblxuICAgIC8vIFJlc29sdmUgcmVxdWVzdGVkIHBhdGggdG8gYWJzb2x1dGUgcGF0aFxuICAgIGNvbnN0IGFic29sdXRlUGF0aCA9IHBhdGgucmVzb2x2ZSh0aGlzLnBhZ2VzUGF0aCwgcmVsYXRpdmVQYXRoKTtcblxuICAgIC8vIElmIHRoZSByZXF1ZXN0ZWQgZmlsZSBpcyBub3QgYSBIVE1MIGZpbGUgc2VuZCBpdHMgcmF3IGNvbnRlbnRcbiAgICBpZiAoIWFic29sdXRlUGF0aCB8fCAhYWJzb2x1dGVQYXRoLmVuZHNXaXRoKCcuaHRtbCcpKSB7XG4gICAgICByZXR1cm4gdGhpcy5maWxlUmVzcG9uc2UoYWJzb2x1dGVQYXRoKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgcGFyYW1ldGVyc1xuICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMuZ2V0RGVmYXVsdFBhcmFtcyhyZXEuY29uZmlnKTtcbiAgICBjb25zdCBsb2NhbGUgPSB0aGlzLmdldExvY2FsZShyZXEpO1xuICAgIGlmIChsb2NhbGUpIHtcbiAgICAgIHBhcmFtcy5sb2NhbGUgPSBsb2NhbGU7XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgY29uc3QgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zKTtcblxuICAgIHJldHVybiB0aGlzLnBhZ2VSZXNwb25zZShhYnNvbHV0ZVBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgdHJhbnNsYXRpb24gZnJvbSB0aGUgSlNPTiByZXNvdXJjZSBmb3IgYSBnaXZlbiBsb2NhbGUuIFRoZSBKU09OXG4gICAqIHJlc291cmNlIGlzIHBhcnNlZCBhY2NvcmRpbmcgdG8gaTE4bmV4dCBzeW50YXguXG4gICAqXG4gICAqIEV4YW1wbGUgSlNPTiBjb250ZW50OlxuICAgKiBgYGBqc1xuICAgKiAge1xuICAgKiAgICBcImVuXCI6IHsgICAgICAgICAgICAgICAvLyByZXNvdXJjZSBmb3IgbGFuZ3VhZ2UgYGVuYCAoRW5nbGlzaClcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJIZWxsbyFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfSxcbiAgICogICAgXCJkZVwiOiB7ICAgICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxhbmd1YWdlIGBkZWAgKEdlcm1hbilcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJIYWxsbyFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfVxuICAgKiAgICBcImRlLUNIXCI6IHsgICAgICAgICAgICAvLyByZXNvdXJjZSBmb3IgbG9jYWxlIGBkZS1DSGAgKFN3aXNzIEdlcm1hbilcbiAgICogICAgICBcInRyYW5zbGF0aW9uXCI6IHtcbiAgICogICAgICAgIFwiZ3JlZXRpbmdcIjogXCJHcsO8ZXppIVwiXG4gICAqICAgICAgfVxuICAgKiAgICB9XG4gICAqICB9XG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUgdG8gdHJhbnNsYXRlIHRvLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgdHJhbnNsYXRpb24gb3IgYW4gZW1wdHkgb2JqZWN0IGlmIG5vIG1hdGNoaW5nXG4gICAqIHRyYW5zbGF0aW9uIHdhcyBmb3VuZC5cbiAgICovXG4gIGdldEpzb25UcmFuc2xhdGlvbihsb2NhbGUpIHtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBKU09OIHJlc291cmNlXG4gICAgaWYgKHRoaXMuanNvblBhcmFtZXRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cblxuICAgIC8vIElmIGxvY2FsZSBpcyBub3Qgc2V0IHVzZSB0aGUgZmFsbGJhY2sgbG9jYWxlXG4gICAgbG9jYWxlID0gbG9jYWxlIHx8IHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGU7XG5cbiAgICAvLyBHZXQgbWF0Y2hpbmcgdHJhbnNsYXRpb24gYnkgbG9jYWxlLCBsYW5ndWFnZSBvciBmYWxsYmFjayBsb2NhbGVcbiAgICBjb25zdCBsYW5ndWFnZSA9IGxvY2FsZS5zcGxpdCgnLScpWzBdO1xuICAgIGNvbnN0IHJlc291cmNlID1cbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbbG9jYWxlXSB8fFxuICAgICAgdGhpcy5qc29uUGFyYW1ldGVyc1tsYW5ndWFnZV0gfHxcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZV0gfHxcbiAgICAgIHt9O1xuICAgIGNvbnN0IHRyYW5zbGF0aW9uID0gcmVzb3VyY2UudHJhbnNsYXRpb24gfHwge307XG4gICAgcmV0dXJuIHRyYW5zbGF0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSB0cmFuc2xhdGlvbiBmcm9tIHRoZSBKU09OIHJlc291cmNlIGZvciBhIGdpdmVuIGxvY2FsZSB3aXRoXG4gICAqIHBsYWNlaG9sZGVycyBmaWxsZWQgaW4gYnkgZ2l2ZW4gcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlIHRvIHRyYW5zbGF0ZSB0by5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycyB0byBmaWxsIGludG8gYW55IHBsYWNlaG9sZGVyc1xuICAgKiB3aXRoaW4gdGhlIHRyYW5zbGF0aW9ucy5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHRyYW5zbGF0aW9uIG9yIGFuIGVtcHR5IG9iamVjdCBpZiBubyBtYXRjaGluZ1xuICAgKiB0cmFuc2xhdGlvbiB3YXMgZm91bmQuXG4gICAqL1xuICBnZXRKc29uUGxhY2Vob2xkZXJzKGxvY2FsZSwgcGFyYW1zID0ge30pIHtcbiAgICAvLyBJZiBsb2NhbGl6YXRpb24gaXMgZGlzYWJsZWQgb3IgdGhlcmUgaXMgbm8gSlNPTiByZXNvdXJjZVxuICAgIGlmICghdGhpcy5wYWdlc0NvbmZpZy5lbmFibGVMb2NhbGl6YXRpb24gfHwgIXRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGgpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG5cbiAgICAvLyBHZXQgSlNPTiBwbGFjZWhvbGRlcnNcbiAgICBsZXQgcGxhY2Vob2xkZXJzID0gdGhpcy5nZXRKc29uVHJhbnNsYXRpb24obG9jYWxlKTtcblxuICAgIC8vIEZpbGwgaW4gYW55IHBsYWNlaG9sZGVycyBpbiB0aGUgdHJhbnNsYXRpb247IHRoaXMgYWxsb3dzIGEgdHJhbnNsYXRpb25cbiAgICAvLyB0byBjb250YWluIGRlZmF1bHQgcGxhY2Vob2xkZXJzIGxpa2Uge3thcHBOYW1lfX0gd2hpY2ggYXJlIGZpbGxlZCBoZXJlXG4gICAgcGxhY2Vob2xkZXJzID0gSlNPTi5zdHJpbmdpZnkocGxhY2Vob2xkZXJzKTtcbiAgICBwbGFjZWhvbGRlcnMgPSBtdXN0YWNoZS5yZW5kZXIocGxhY2Vob2xkZXJzLCBwYXJhbXMpO1xuICAgIHBsYWNlaG9sZGVycyA9IEpTT04ucGFyc2UocGxhY2Vob2xkZXJzKTtcblxuICAgIHJldHVybiBwbGFjZWhvbGRlcnM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHJlc3BvbnNlIHdpdGggZmlsZSBjb250ZW50LlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBvZiB0aGUgZmlsZSB0byByZXR1cm4uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGFyYW1zPXt9XSBUaGUgcGFyYW1ldGVycyB0byBiZSBpbmNsdWRlZCBpbiB0aGUgcmVzcG9uc2VcbiAgICogaGVhZGVyLiBUaGVzZSB3aWxsIGFsc28gYmUgdXNlZCB0byBmaWxsIHBsYWNlaG9sZGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtwbGFjZWhvbGRlcnM9e31dIFRoZSBwbGFjZWhvbGRlcnMgdG8gZmlsbCBpbiB0aGUgY29udGVudC5cbiAgICogVGhlc2Ugd2lsbCBub3QgYmUgaW5jbHVkZWQgaW4gdGhlIHJlc3BvbnNlIGhlYWRlci5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIFByb21pc2UgUm91dGVyIHJlc3BvbnNlLlxuICAgKi9cbiAgYXN5bmMgcGFnZVJlc3BvbnNlKHBhdGgsIHBhcmFtcyA9IHt9LCBwbGFjZWhvbGRlcnMgPSB7fSkge1xuICAgIC8vIEdldCBmaWxlIGNvbnRlbnRcbiAgICBsZXQgZGF0YTtcbiAgICB0cnkge1xuICAgICAgZGF0YSA9IGF3YWl0IHRoaXMucmVhZEZpbGUocGF0aCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgY29uZmlnIHBsYWNlaG9sZGVyczsgY2FuIGJlIGFuIG9iamVjdCwgYSBmdW5jdGlvbiBvciBhbiBhc3luYyBmdW5jdGlvblxuICAgIGxldCBjb25maWdQbGFjZWhvbGRlcnMgPVxuICAgICAgdHlwZW9mIHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzID09PSAnZnVuY3Rpb24nXG4gICAgICAgID8gdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnMocGFyYW1zKVxuICAgICAgICA6IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVycykgPT09ICdbb2JqZWN0IE9iamVjdF0nXG4gICAgICAgICAgPyB0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVyc1xuICAgICAgICAgIDoge307XG4gICAgaWYgKGNvbmZpZ1BsYWNlaG9sZGVycyBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgIGNvbmZpZ1BsYWNlaG9sZGVycyA9IGF3YWl0IGNvbmZpZ1BsYWNlaG9sZGVycztcbiAgICB9XG5cbiAgICAvLyBGaWxsIHBsYWNlaG9sZGVyc1xuICAgIGNvbnN0IGFsbFBsYWNlaG9sZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIGNvbmZpZ1BsYWNlaG9sZGVycywgcGxhY2Vob2xkZXJzKTtcbiAgICBjb25zdCBwYXJhbXNBbmRQbGFjZWhvbGRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBwYXJhbXMsIGFsbFBsYWNlaG9sZGVycyk7XG4gICAgZGF0YSA9IG11c3RhY2hlLnJlbmRlcihkYXRhLCBwYXJhbXNBbmRQbGFjZWhvbGRlcnMpO1xuXG4gICAgLy8gQWRkIHBsYWNlaG9sZGVycyBpbiBoZWFkZXIgdG8gYWxsb3cgcGFyc2luZyBmb3IgcHJvZ3JhbW1hdGljIHVzZVxuICAgIC8vIG9mIHJlc3BvbnNlLCBpbnN0ZWFkIG9mIGhhdmluZyB0byBwYXJzZSB0aGUgSFRNTCBjb250ZW50LlxuICAgIGNvbnN0IGhlYWRlcnMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW2Ake3BhZ2VQYXJhbUhlYWRlclByZWZpeH0ke3BbMF0udG9Mb3dlckNhc2UoKX1gXSA9IHBbMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gbTtcbiAgICB9LCB7fSk7XG5cbiAgICByZXR1cm4geyB0ZXh0OiBkYXRhLCBoZWFkZXJzOiBoZWFkZXJzIH07XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHJlc3BvbnNlIHdpdGggZmlsZSBjb250ZW50LlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBvZiB0aGUgZmlsZSB0byByZXR1cm4uXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlUm91dGVyIHJlc3BvbnNlLlxuICAgKi9cbiAgYXN5bmMgZmlsZVJlc3BvbnNlKHBhdGgpIHtcbiAgICAvLyBHZXQgZmlsZSBjb250ZW50XG4gICAgbGV0IGRhdGE7XG4gICAgdHJ5IHtcbiAgICAgIGRhdGEgPSBhd2FpdCB0aGlzLnJlYWRGaWxlKHBhdGgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgdGV4dDogZGF0YSB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlYWRzIGFuZCByZXR1cm5zIHRoZSBjb250ZW50IG9mIGEgZmlsZSBhdCBhIGdpdmVuIHBhdGguIEZpbGUgcmVhZGluZyB0b1xuICAgKiBzZXJ2ZSBjb250ZW50IG9uIHRoZSBzdGF0aWMgcm91dGUgaXMgb25seSBhbGxvd2VkIGZyb20gdGhlIHBhZ2VzXG4gICAqIGRpcmVjdG9yeSBvbiBkb3dud2FyZHMuXG4gICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAqICoqV0FSTklORzoqKiBBbGwgZmlsZSByZWFkcyBpbiB0aGUgUGFnZXNSb3V0ZXIgbXVzdCBiZSBleGVjdXRlZCBieSB0aGlzXG4gICAqIHdyYXBwZXIgYmVjYXVzZSBpdCBhbHNvIGRldGVjdHMgYW5kIHByZXZlbnRzIGNvbW1vbiBleHBsb2l0cy5cbiAgICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICogQHBhcmFtIHtTdHJpbmd9IGZpbGVQYXRoIFRoZSBwYXRoIHRvIHRoZSBmaWxlIHRvIHJlYWQuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFN0cmluZz59IFRoZSBmaWxlIGNvbnRlbnQuXG4gICAqL1xuICBhc3luYyByZWFkRmlsZShmaWxlUGF0aCkge1xuICAgIC8vIE5vcm1hbGl6ZSBwYXRoIHRvIHByZXZlbnQgaXQgZnJvbSBjb250YWluaW5nIGFueSBkaXJlY3RvcnkgY2hhbmdpbmdcbiAgICAvLyBVTklYIHBhdHRlcm5zIHdoaWNoIGNvdWxkIGV4cG9zZSB0aGUgd2hvbGUgZmlsZSBzeXN0ZW0sIGUuZy5cbiAgICAvLyBgaHR0cDovL2V4YW1wbGUuY29tL3BhcnNlL2FwcHMvLi4vZmlsZS50eHRgIHJlcXVlc3RzIGEgZmlsZSBvdXRzaWRlXG4gICAgLy8gb2YgdGhlIHBhZ2VzIGRpcmVjdG9yeSBzY29wZS5cbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IHBhdGgubm9ybWFsaXplKGZpbGVQYXRoKTtcblxuICAgIC8vIEFib3J0IGlmIHRoZSBwYXRoIGlzIG91dHNpZGUgb2YgdGhlIHBhdGggZGlyZWN0b3J5IHNjb3BlXG4gICAgaWYgKCFub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKHRoaXMucGFnZXNQYXRoKSkge1xuICAgICAgdGhyb3cgZXJyb3JzLmZpbGVPdXRzaWRlQWxsb3dlZFNjb3BlO1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCBmcy5yZWFkRmlsZShub3JtYWxpemVkUGF0aCwgJ3V0Zi04Jyk7XG4gIH1cblxuICAvKipcbiAgICogTG9hZHMgYSBsYW5ndWFnZSByZXNvdXJjZSBKU09OIGZpbGUgdGhhdCBpcyB1c2VkIGZvciB0cmFuc2xhdGlvbnMuXG4gICAqL1xuICBsb2FkSnNvblJlc291cmNlKCkge1xuICAgIGlmICh0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkpzb25QYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGpzb24gPSByZXF1aXJlKHBhdGgucmVzb2x2ZSgnLi8nLCB0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkpzb25QYXRoKSk7XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzID0ganNvbjtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aHJvdyBlcnJvcnMuanNvbkZhaWxlZEZpbGVMb2FkaW5nO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBFeHRyYWN0cyBhbmQgcmV0dXJucyB0aGUgcGFnZSBkZWZhdWx0IHBhcmFtZXRlcnMgZnJvbSB0aGUgUGFyc2UgU2VydmVyXG4gICAqIGNvbmZpZ3VyYXRpb24uIFRoZXNlIHBhcmFtZXRlcnMgYXJlIG1hZGUgYWNjZXNzaWJsZSBpbiBldmVyeSBwYWdlIHNlcnZlZFxuICAgKiBieSB0aGlzIHJvdXRlci5cbiAgICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBkZWZhdWx0IHBhcmFtZXRlcnMuXG4gICAqL1xuICBnZXREZWZhdWx0UGFyYW1zKGNvbmZpZykge1xuICAgIHJldHVybiBjb25maWdcbiAgICAgID8ge1xuICAgICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IGNvbmZpZy5hcHBJZCxcbiAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBbcGFnZVBhcmFtcy5wdWJsaWNTZXJ2ZXJVcmxdOiBjb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgfVxuICAgICAgOiB7fTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeHRyYWN0cyBhbmQgcmV0dXJucyB0aGUgbG9jYWxlIGZyb20gYW4gZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSBleHByZXNzIHJlcXVlc3QuXG4gICAqIEByZXR1cm5zIHtTdHJpbmd8dW5kZWZpbmVkfSBUaGUgbG9jYWxlLCBvciB1bmRlZmluZWQgaWYgbm8gbG9jYWxlIHdhcyBzZXQuXG4gICAqL1xuICBnZXRMb2NhbGUocmVxKSB7XG4gICAgY29uc3QgbG9jYWxlID1cbiAgICAgIChyZXEucXVlcnkgfHwge30pW3BhZ2VQYXJhbXMubG9jYWxlXSB8fFxuICAgICAgKHJlcS5ib2R5IHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEucGFyYW1zIHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEuaGVhZGVycyB8fCB7fSlbcGFnZVBhcmFtSGVhZGVyUHJlZml4ICsgcGFnZVBhcmFtcy5sb2NhbGVdO1xuICAgIHJldHVybiBsb2NhbGU7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIHJlc3BvbnNlIHdpdGggaHR0cCByZWRpcmV0LlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSBleHByZXNzIHJlcXVlc3QuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBmaWxlIHRvIHJldHVybi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcXVlcnkgcGFyYW1ldGVycyB0byBpbmNsdWRlLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZSBSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBhc3luYyByZWRpcmVjdFJlc3BvbnNlKHVybCwgcGFyYW1zKSB7XG4gICAgLy8gUmVtb3ZlIGFueSBwYXJhbWV0ZXJzIHdpdGggdW5kZWZpbmVkIHZhbHVlXG4gICAgcGFyYW1zID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5yZWR1Y2UoKG0sIHApID0+IHtcbiAgICAgIGlmIChwWzFdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbVtwWzBdXSA9IHBbMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gbTtcbiAgICB9LCB7fSk7XG5cbiAgICAvLyBDb21wb3NlIFVSTCB3aXRoIHBhcmFtZXRlcnMgaW4gcXVlcnlcbiAgICBjb25zdCBsb2NhdGlvbiA9IG5ldyBVUkwodXJsKTtcbiAgICBPYmplY3QuZW50cmllcyhwYXJhbXMpLmZvckVhY2gocCA9PiBsb2NhdGlvbi5zZWFyY2hQYXJhbXMuc2V0KHBbMF0sIHBbMV0pKTtcbiAgICBjb25zdCBsb2NhdGlvblN0cmluZyA9IGxvY2F0aW9uLnRvU3RyaW5nKCk7XG5cbiAgICAvLyBBZGQgcGFyYW1ldGVycyB0byBoZWFkZXIgdG8gYWxsb3cgcGFyc2luZyBmb3IgcHJvZ3JhbW1hdGljIHVzZVxuICAgIC8vIG9mIHJlc3BvbnNlLCBpbnN0ZWFkIG9mIGhhdmluZyB0byBwYXJzZSB0aGUgSFRNTCBjb250ZW50LlxuICAgIGNvbnN0IGhlYWRlcnMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW2Ake3BhZ2VQYXJhbUhlYWRlclByZWZpeH0ke3BbMF0udG9Mb3dlckNhc2UoKX1gXSA9IHBbMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gbTtcbiAgICB9LCB7fSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAzMDMsXG4gICAgICBsb2NhdGlvbjogbG9jYXRpb25TdHJpbmcsXG4gICAgICBoZWFkZXJzOiBoZWFkZXJzLFxuICAgIH07XG4gIH1cblxuICBkZWZhdWx0UGFnZVBhdGgoZmlsZSkge1xuICAgIHJldHVybiBwYXRoLmpvaW4odGhpcy5wYWdlc1BhdGgsIGZpbGUpO1xuICB9XG5cbiAgY29tcG9zZVBhZ2VVcmwoZmlsZSwgcHVibGljU2VydmVyVXJsLCBsb2NhbGUpIHtcbiAgICBsZXQgdXJsID0gcHVibGljU2VydmVyVXJsO1xuICAgIHVybCArPSB1cmwuZW5kc1dpdGgoJy8nKSA/ICcnIDogJy8nO1xuICAgIHVybCArPSB0aGlzLnBhZ2VzRW5kcG9pbnQgKyAnLyc7XG4gICAgdXJsICs9IGxvY2FsZSA9PT0gdW5kZWZpbmVkID8gJycgOiBsb2NhbGUgKyAnLyc7XG4gICAgdXJsICs9IGZpbGU7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxuXG4gIG5vdEZvdW5kKCkge1xuICAgIHJldHVybiB7XG4gICAgICB0ZXh0OiAnTm90IGZvdW5kLicsXG4gICAgICBzdGF0dXM6IDQwNCxcbiAgICB9O1xuICB9XG5cbiAgaW52YWxpZFJlcXVlc3QoKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICBlcnJvci5zdGF0dXMgPSA0MDM7XG4gICAgZXJyb3IubWVzc2FnZSA9ICd1bmF1dGhvcml6ZWQnO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIGluIHRoZSByZXF1ZXN0IG9iamVjdCB0byBtYWtlIGl0XG4gICAqIGVhc2lseSBhY2Nlc3NpYmxlIHRocm91Z2h0b3V0IHJlcXVlc3QgcHJvY2Vzc2luZy5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtCb29sZWFufSBmYWlsR3JhY2VmdWxseSBJcyB0cnVlIGlmIGZhaWxpbmcgdG8gc2V0IHRoZSBjb25maWcgc2hvdWxkXG4gICAqIG5vdCByZXN1bHQgaW4gYW4gaW52YWxpZCByZXF1ZXN0IHJlc3BvbnNlLiBEZWZhdWx0IGlzIGBmYWxzZWAuXG4gICAqL1xuICBzZXRDb25maWcocmVxLCBmYWlsR3JhY2VmdWxseSA9IGZhbHNlKSB7XG4gICAgcmVxLmNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCB8fCByZXEucXVlcnkuYXBwSWQpO1xuICAgIGlmICghcmVxLmNvbmZpZyAmJiAhZmFpbEdyYWNlZnVsbHkpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgbW91bnRQYWdlc1JvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvdmVyaWZ5X2VtYWlsYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmVyaWZ5RW1haWwocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQT1NUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC9yZXNlbmRfdmVyaWZpY2F0aW9uX2VtYWlsYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzZW5kVmVyaWZpY2F0aW9uRW1haWwocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vY2hvb3NlX3Bhc3N3b3JkYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFzc3dvcmRSZXNldChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNldFBhc3N3b3JkKHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVxdWVzdFJlc2V0UGFzc3dvcmQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vKCopP2AsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEsIHRydWUpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRpY1JvdXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGV4cHJlc3NSb3V0ZXIoKSB7XG4gICAgY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIudXNlKCcvJywgc3VwZXIuZXhwcmVzc1JvdXRlcigpKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhZ2VzUm91dGVyO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIFBhZ2VzUm91dGVyLFxuICBwYWdlUGFyYW1IZWFkZXJQcmVmaXgsXG4gIHBhZ2VQYXJhbXMsXG4gIHBhZ2VzLFxufTtcbiJdfQ==