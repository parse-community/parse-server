import PromiseRouter from '../PromiseRouter';
import Config from '../Config';
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { Parse } from 'parse/node';
import Utils from '../Utils';
import mustache from 'mustache';
import Page from '../Page';

// All pages with custom page key for reference and file name
const pages = Object.freeze({
  passwordReset: new Page({ id: 'passwordReset', defaultFile: 'password_reset.html' }),
  passwordResetSuccess: new Page({ id: 'passwordResetSuccess', defaultFile: 'password_reset_success.html' }),
  passwordResetLinkInvalid: new Page({ id: 'passwordResetLinkInvalid', defaultFile: 'password_reset_link_invalid.html' }),
  emailVerificationSuccess: new Page({ id: 'emailVerificationSuccess', defaultFile: 'email_verification_success.html' }),
  emailVerificationSendFail: new Page({ id: 'emailVerificationSendFail', defaultFile: 'email_verification_send_fail.html' }),
  emailVerificationResendSuccess: new Page({ id: 'emailVerificationResendSuccess', defaultFile: 'email_verification_send_success.html' }),
  emailVerificationLinkInvalid: new Page({ id: 'emailVerificationLinkInvalid', defaultFile: 'email_verification_link_invalid.html' }),
  emailVerificationLinkExpired: new Page({ id: 'emailVerificationLinkExpired', defaultFile: 'email_verification_link_expired.html' }),
});
// All page parameters for reference to be used as template placeholders or query params
const pageParams = Object.freeze({
  appName: 'appName',
  appId: 'appId',
  token: 'token',
  username: 'username',
  error: 'error',
  locale: 'locale',
  publicServerUrl: 'publicServerUrl',
});
// The header prefix to add page params as response headers
const pageParamHeaderPrefix = 'x-parse-page-param-';

export class PagesRouter extends PromiseRouter {
  /**
   * Constructs a PagesRouter.
   * @param {Object} pages The pages options from the Parse Server configuration.
   */
  constructor(pages = {}) {
    super();

    this.pagesEndpoint = pages.pagesEndpoint
      ? pages.pagesEndpoint
      : 'apps';
    this.pagesPath = pages.pagesPath
      ? path.resolve('./', pages.pagesPath)
      : path.resolve(__dirname, '../../public');
    this.mountPagesRoutes();
  }

  verifyEmail(req) {
    const config = req.config;
    const { username, token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!config) {
      this.invalidRequest();
    }

    if (!token || !username) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }

    const userController = config.userController;
    return userController.verifyEmail(username, token).then(
      () => {
        const params = {
          [pageParams.username]: username,
        };
        return this.goToPage(req, pages.emailVerificationSuccess, params);
      },
      () => {
        const params = {
          [pageParams.username]: username,
        };
        return this.goToPage(req, pages.emailVerificationLinkExpired, params);
      }
    );
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

    return userController.resendVerificationEmail(username).then(
      () => {
        return this.goToPage(req, pages.emailVerificationResendSuccess);
      },
      () => {
        return this.goToPage(req, pages.emailVerificationSendFail);
      }
    );
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

    const { username, token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!username || !token) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }

    return config.userController.checkResetTokenValidity(username, token).then(
      () => {
        const params = {
          [pageParams.token]: token,
          [pageParams.username]: username,
          [pageParams.appId]: config.applicationId,
          [pageParams.appName]: config.appName,
        };
        return this.goToPage(req, pages.passwordReset, params);
      },
      () => {
        const params = {
          [pageParams.username]: username,
        };
        return this.goToPage(req, pages.passwordResetLinkInvalid, params);
      }
    );
  }

  resetPassword(req) {
    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    const { username, new_password, token: rawToken } = req.body;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if ((!username || !token || !new_password) && req.xhr === false) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }

    if (!username) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'Missing username');
    }

    if (!token) {
      throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'Missing token');
    }

    if (!new_password) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'Missing password');
    }

    return config.userController
      .updatePassword(username, token, new_password)
      .then(
        () => {
          return Promise.resolve({
            success: true,
          });
        },
        err => {
          return Promise.resolve({
            success: false,
            err,
          });
        }
      )
      .then(result => {
        if (req.xhr) {
          if (result.success) {
            return Promise.resolve({
              status: 200,
              response: 'Password successfully reset',
            });
          }
          if (result.err) {
            throw new Parse.Error(Parse.Error.OTHER_CAUSE, `${result.err}`);
          }
        }

        const query = result.success
          ? {
            [pageParams.username]: username,
          }
          : {
            [pageParams.username]: username,
            [pageParams.token]: token,
            [pageParams.appId]: config.applicationId,
            [pageParams.error]: result.err,
            [pageParams.appName]: config.appName,
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
   * @returns {Promise<Object>} The express response.
   */
  goToPage(req, page, params = {}, responseType) {
    const config = req.config;

    // Determine redirect either by force, response setting or request method
    const redirect = config.pages.forceRedirect
      ? true
      : responseType !== undefined
        ? responseType
        : req.method == 'POST';

    // Include default parameters
    const defaultParams = {
      [pageParams.appId]: config.appId,
      [pageParams.appName]: config.appName,
      [pageParams.publicServerUrl]: config.publicServerURL,
    };
    if (Object.values(defaultParams).includes(undefined)) {
      return this.notFound();
    }
    params = Object.assign(params, defaultParams);

    // Add locale to params to ensure it is passed on with every request;
    // that means, once a locale is set, it is passed on to any follow-up page,
    // e.g. request_password_reset -> password_reset -> passwort_reset_success
    const locale =
      (req.query || {})[pageParams.locale]
      || (req.body || {})[pageParams.locale]
      || (req.params || {})[pageParams.locale]
      || (req.headers || {})[pageParamHeaderPrefix + pageParams.locale];
    params[pageParams.locale] = locale;

    // Compose paths and URLs
    const defaultFile = page.defaultFile;
    const defaultPath = this.defaultPagePath(defaultFile);
    const defaultUrl = this.composePageUrl(defaultFile, config.publicServerURL);

    // If custom URL is set redirect to it without localization
    const customUrl = config.pages.customUrls[page.id];
    if (customUrl && !Utils.isPath(customUrl)) {
      return this.redirectResponse(customUrl, params);
    }

    // If localization is enabled
    if (config.pages.enableLocalization && locale) {
      return Utils.getLocalizedPath(defaultPath, locale).then(({ path, subdir }) =>
        redirect
          ? this.redirectResponse(this.composePageUrl(defaultFile, config.publicServerURL, subdir), params)
          : this.pageResponse(path, params)
      );
    } else {
      return redirect
        ? this.redirectResponse(defaultUrl, params)
        : this.pageResponse(defaultPath, params);
    }
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @param {Object} placeholders The placeholders to fill in the
   * content.
   * @returns {Object} The Promise Router response.
   */
  async pageResponse(path, placeholders) {
    // Get file content
    let data;
    try {
      data = await fs.readFile(path, 'utf-8');
    } catch (e) {
      return this.notFound();
    }

    // Fill placeholders
    data = mustache.render(data, placeholders);

    // Add placeholers in header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(placeholders).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});

    return { text: data, headers: headers };
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
      headers: headers,
    };
  }

  defaultPagePath(file) {
    return path.join(this.pagesPath, file);
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
      status: 404,
    };
  }

  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }

  setConfig(req) {
    req.config = Config.get(req.params.appId || req.query.appId);
    if (!req.config) {
      this.invalidRequest();
    }
    return Promise.resolve();
  }

  mountPagesRoutes() {
    this.route(
      'GET',
      `/${this.pagesEndpoint}/:appId/verify_email`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.verifyEmail(req);
      }
    );

    this.route(
      'POST',
      `/${this.pagesEndpoint}/:appId/resend_verification_email`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.resendVerificationEmail(req);
      }
    );

    this.route(
      'GET',
      `/${this.pagesEndpoint}/choose_password`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.passwordReset(req);
      }
    );

    this.route(
      'POST',
      `/${this.pagesEndpoint}/:appId/request_password_reset`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.resetPassword(req);
      }
    );

    this.route(
      'GET',
      `/${this.pagesEndpoint}/:appId/request_password_reset`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.requestResetPassword(req);
      }
    );
  }

  expressRouter() {
    const router = express.Router();
    router.use(`/${this.pagesEndpoint}`, express.static(this.pagesPath));
    router.use('/', super.expressRouter());
    return router;
  }
}

export default PagesRouter;
module.exports = {
  PagesRouter,
  pageParams,
  pages,
};
