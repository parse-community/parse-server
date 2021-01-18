import PromiseRouter from '../PromiseRouter';
import Config from '../Config';
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import qs from 'querystring';
import { Parse } from 'parse/node';
import Utils from '../Utils';
import mustache from 'mustache';

const publicPath = path.resolve(__dirname, '../../public');
const defaultPagePath = file => { return path.join(publicPath, file); };
const defaultPageUrl = (file, serverUrl) => { return new URL('/apps/' + file, serverUrl).toString(); };
// All pages with custom page key for reference and file name
const pages = Object.freeze({
  invalidLink: { customPageKey: 'invalidLink', defaultFile: 'invalid_link.html' },
  linkSendFail: { customPageKey: 'linkSendFail', defaultFile: 'link_send_fail.html' },
  choosePassword: { customPageKey: 'choosePassword', defaultFile: 'choose_password.html' },
  linkSendSuccess: { customPageKey: 'linkSendSuccess', defaultFile: 'link_send_success.html' },
  verifyEmailSuccess: { customPageKey: 'verifyEmailSuccess', defaultFile: 'verify_email_success.html', },
  passwordResetSuccess: { customPageKey: 'passwordResetSuccess', defaultFile: 'password_reset_success.html', },
  invalidVerificationLink: { customPageKey: 'invalidVerificationLink', defaultFile: 'invalid_verification_link.html', },
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

export class PublicAPIRouter extends PromiseRouter {
  verifyEmail(req) {
    const config = req.config;
    const { username, token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!config) {
      this.invalidRequest();
    }

    if (!token || !username) {
      return this.goToPage(req, pages.invalidLink);
    }

    const userController = config.userController;
    return userController.verifyEmail(username, token).then(
      () => {
        const params = {
          [pageParams.username]: username,
        };
        return this.goToPage(req, pages.verifyEmailSuccess, params);
      },
      () => {
        if (req.query.username && req.params.appId) {
          const params = {
            [pageParams.username]: req.query.username,
            [pageParams.appId]: req.params.appId,
          };
          return this.goToPage(req, pages.invalidVerificationLink, params);
        } else {
          return this.goToPage(req, pages.invalidLink);
        }
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
      return this.goToPage(req, pages.invalidLink);
    }

    const userController = config.userController;

    return userController.resendVerificationEmail(username).then(
      () => {
        return this.goToPage(req, pages.linkSendSuccess);
      },
      () => {
        return this.goToPage(req, pages.linkSendFail);
      }
    );
  }

  choosePassword(req) {
    return this.goToPage(req, pages.choosePassword);
  }

  requestResetPassword(req) {
    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    const { username, token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!username || !token) {
      return this.goToPage(req, pages.invalidLink);
    }

    return config.userController.checkResetTokenValidity(username, token).then(
      () => {
        const params = {
          [pageParams.token]: token,
          [pageParams.username]: username,
          [pageParams.appId]: config.applicationId,
          [pageParams.appName]: config.appName,
        };
        return this.goToPage(req, pages.choosePassword, params);
      },
      () => {
        return this.goToPage(req, pages.invalidLink);
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
      return this.goToPage(req, pages.invalidLink);
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

        const encodedUsername = encodeURIComponent(username);
        const query = result.success
          ? {
            [pageParams.username]: encodedUsername,
          }
          : {
            [pageParams.username]: username,
            [pageParams.token]: token,
            [pageParams.appId]: config.applicationId,
            [pageParams.error]: result.err,
            [pageParams.appName]: config.appName,
          };
        const page = result.success ? pages.passwordResetSuccess : pages.choosePassword;

        return this.goToPage(req, page, query, false);
      });
  }

  /**
   * Returns page content if the page is a local file or returns a
   * redirect to a custom page.
   * @param {Object} req The express request.
   * @param {Object} page The page to go to.
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
    const locale = (req.query || {}).locale || (req.params || {}).locale;
    const redirect = responseType !== undefined ? responseType : req.method == 'POST';

    // Ensure default parameters required for every page
    const requiredParams = {
      [pageParams.appId]: config.appId,
      [pageParams.appName]: config.appName,
      [pageParams.publicServerUrl]: config.publicServerURL,
    };
    if (Object.values(requiredParams).includes(undefined)) {
      return this.notFound();
    }
    params = Object.assign(params, requiredParams);

    // Add locale to params to ensure it is passed on with every request;
    // that means, once a locale is set, it is passed on to any follow-up page,
    // e.g. request_password_reset -> choose_password -> passwort_reset_success
    params[pageParams.locale] = locale;

    // Compose paths and URLs
    const customPage = config.customPages[page.customPageKey];
    const defaultFile = page.defaultFile;
    const defaultPath = defaultPagePath(defaultFile);
    const defaultUrl = defaultPageUrl(defaultFile, config.publicServerURL);

    // If custom page is set redirect to it without localization
    if (customPage) {
      return this.redirectResponse(customPage, params);
    }

    // If localization is enabled
    if (config.enablePageLocalization && locale) {
      return Utils.getLocalizedPath(defaultPath, locale).then(({ path, subdir }) =>
        redirect
          ? this.redirectResponse(
            new URL(`/apps/${subdir}/${defaultFile}`, config.publicServerURL).toString(),
            params
          )
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
   * Creates a response with http 303 rediret.
   * @param {Object} req The express request.
   * @param {String} path The path of the file to return.
   * @returns {Object} The Promise Router response.
   */
  async redirectResponse(url, query) {
    // Remove any query parameters with undefined value
    query = Object.entries(query).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[p[0]] = p[1];
      }
      return m;
    }, {});

    // Maybe use this in the future to add params as query instead of headers?
    // const location = new URL(url);
    // Object.entries(query).forEach(p => location.searchParams.set(p[0], p[1]));

    // Add placeholers in header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(query).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});

    return {
      status: 303,
      location: url,
      headers: headers,
    };
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

  mountRoutes() {
    this.route(
      'GET',
      '/apps/:appId/verify_email',
      req => {
        this.setConfig(req);
      },
      req => {
        return this.verifyEmail(req);
      }
    );

    this.route(
      'POST',
      '/apps/:appId/resend_verification_email',
      req => {
        this.setConfig(req);
      },
      req => {
        return this.resendVerificationEmail(req);
      }
    );

    this.route(
      'GET',
      '/apps/choose_password',
      req => {
        this.setConfig(req);
      },
      req => {
        return this.choosePassword(req);
      }
    );

    this.route(
      'POST',
      '/apps/:appId/request_password_reset',
      req => {
        this.setConfig(req);
      },
      req => {
        return this.resetPassword(req);
      }
    );

    this.route(
      'GET',
      '/apps/:appId/request_password_reset',
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
    router.use('/apps', express.static(publicPath));
    router.use('/', super.expressRouter());
    return router;
  }
}

export default PublicAPIRouter;
module.exports = {
  PublicAPIRouter,
  pageParams,
  pages,
};
