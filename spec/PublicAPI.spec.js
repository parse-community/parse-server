'use strict';

const request = require('../lib/request');
const fs = require('fs').promises;
const Utils = require('../lib/Utils');
const Config = require('../lib/Config');
const Definitions = require('../lib/Options/Definitions');
const { PublicAPIRouter, pages, pageParams } = require('../lib/Routers/PublicAPIRouter');

describe('public API', () => {
  describe('basic request', () => {
    it('should return missing username error on ajax request without username provided', async () => {
      await reconfigureServer({
        publicServerURL: 'http://localhost:8378/1',
      });

      try {
        await request({
          method: 'POST',
          url: 'http://localhost:8378/1/apps/test/request_password_reset',
          body: `new_password=user1&token=43634643&username=`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
          },
          followRedirects: false,
        });
      } catch (error) {
        expect(error.status).not.toBe(302);
        expect(error.text).toEqual('{"code":200,"error":"Missing username"}');
      }
    });

    it('should return missing token error on ajax request without token provided', async () => {
      await reconfigureServer({
        publicServerURL: 'http://localhost:8378/1',
      });

      try {
        await request({
          method: 'POST',
          url: 'http://localhost:8378/1/apps/test/request_password_reset',
          body: `new_password=user1&token=&username=Johnny`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
          },
          followRedirects: false,
        });
      } catch (error) {
        expect(error.status).not.toBe(302);
        expect(error.text).toEqual('{"code":-1,"error":"Missing token"}');
      }
    });

    it('should return missing password error on ajax request without password provided', async () => {
      await reconfigureServer({
        publicServerURL: 'http://localhost:8378/1',
      });

      try {
        await request({
          method: 'POST',
          url: 'http://localhost:8378/1/apps/test/request_password_reset',
          body: `new_password=&token=132414&username=Johnny`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
          },
          followRedirects: false,
        });
      } catch (error) {
        expect(error.status).not.toBe(302);
        expect(error.text).toEqual('{"code":201,"error":"Missing password"}');
      }
    });

    it('should get invalid_link.html', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/invalid_link.html',
      });
      expect(httpResponse.status).toBe(200);
    });

    it('should get choose_password', async () => {
      await reconfigureServer({
        appName: 'unused',
        publicServerURL: 'http://localhost:8378/1',
      });
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/choose_password?appId=test',
      });
      expect(httpResponse.status).toBe(200);
    });

    it('should get verify_email_success.html', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/verify_email_success.html',
      });
      expect(httpResponse.status).toBe(200);
    });

    it('should get password_reset_success.html', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/password_reset_success.html',
      });
      expect(httpResponse.status).toBe(200);
    });
  });

  describe('public API without publicServerURL', function () {
    beforeEach(async () => {
      await reconfigureServer({ appName: 'unused' });
    });

    it('should get 404 on verify_email', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/test/verify_email',
      }).catch(e => e);
      expect(httpResponse.status).toBe(404);
    });

    it('should get 404 choose_password', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/choose_password?appId=test',
      }).catch(e => e);
      expect(httpResponse.status).toBe(404);
    });

    it('should get 404 on request_password_reset', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/test/request_password_reset',
      }).catch(e => e);
      expect(httpResponse.status).toBe(404);
    });
  });

  describe('public API supplied with invalid application id', () => {
    beforeEach(async () => {
      await reconfigureServer({ appName: 'unused' });
    });

    it('should get 403 on verify_email', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/invalid/verify_email',
      }).catch(e => e);
      expect(httpResponse.status).toBe(403);
    });

    it('should get 403 choose_password', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/choose_password?id=invalid',
      }).catch(e => e);
      expect(httpResponse.status).toBe(403);
    });

    it('should get 403 on get of request_password_reset', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/invalid/request_password_reset',
      }).catch(e => e);
      expect(httpResponse.status).toBe(403);
    });

    it('should get 403 on post of request_password_reset', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/invalid/request_password_reset',
        method: 'POST',
      }).catch(e => e);
      expect(httpResponse.status).toBe(403);
    });

    it('should get 403 on resendVerificationEmail', async () => {
      const httpResponse = await request({
        url: 'http://localhost:8378/1/apps/invalid/resend_verification_email',
      }).catch(e => e);
      expect(httpResponse.status).toBe(403);
    });
  });

  describe('pages', () => {
    let router = new PublicAPIRouter();
    let req;
    let pageResponse;
    let redirectResponse;
    let readFile;
    const config = {
      appId: 'test',
      appName: 'ExampleAppName',
      verifyUserEmails: true,
      emailAdapter: {
        sendVerificationEmail: () => Promise.resolve(),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendMail: () => {},
      },
      publicServerURL: 'http://localhost:8378/1',
      customPages: {},
      pages: {
        enableLocalization: true,
      },
    };
    async function reconfigureServerWithPageOptions(options) {
      await reconfigureServer({
        appId: Parse.applicationId,
        masterKey: Parse.masterKey,
        serverURL: Parse.serverURL,
        pages: options,
      });
    }

    beforeEach(async () => {
      router = new PublicAPIRouter();
      readFile = spyOn(fs, 'readFile').and.callThrough();
      pageResponse = spyOn(PublicAPIRouter.prototype, 'pageResponse').and.callThrough()
      redirectResponse = spyOn(PublicAPIRouter.prototype, 'redirectResponse').and.callThrough();
      req = {
        method: 'GET',
        config: {
          appId: 'test',
          appName: 'ExampleAppName',
          publicServerURL: 'http://localhost:8378/1',
          customPages: {},
          pages: {
            enableLocalization: true,
          },
        },
        query: {
          locale: 'de-AT',
        },
      };
    });

    describe('server options', () => {
      it('uses default configuration when none is set', async () => {
        await reconfigureServerWithPageOptions({});
        expect(Config.get(Parse.applicationId).pages.enableLocalization).toBe(
          Definitions.PagesOptions.enableLocalization.default
        );
      });

      it('throws on invalid configuration', async () => {
        const options = [
          [],
          'a',
          0,
          { enableLocalization: 'a' },
          { enableLocalization: 0 },
          { enableLocalization: {} },
        ];
        for (const option of options) {
          await expectAsync(reconfigureServerWithPageOptions(option)).toBeRejected();
        }
      });
    });

    describe('placeholders', () => {
      it('replaces placeholder in response content', async () => {
        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();

        expect(readFile.calls.all()[0].returnValue).toBeDefined();
        const originalContent = await readFile.calls.all()[0].returnValue;
        expect(originalContent).toContain('{{appName}}');

        expect(pageResponse.calls.all()[0].returnValue).toBeDefined();
        const replacedContent = await pageResponse.calls.all()[0].returnValue;
        expect(replacedContent.text).not.toContain('{{appName}}');
        expect(replacedContent.text).toContain(req.config.appName);
      });

      it('removes undefined placeholder in response content', async () => {
        await expectAsync(router.goToPage(req, pages.choosePassword)).toBeResolved();

        expect(readFile.calls.all()[0].returnValue).toBeDefined();
        const originalContent = await readFile.calls.all()[0].returnValue;
        expect(originalContent).toContain('{{error}}');

        // There is no error placeholder value set by default, so the
        // {{error}} placeholder should just be removed from content
        expect(pageResponse.calls.all()[0].returnValue).toBeDefined();
        const replacedContent = await pageResponse.calls.all()[0].returnValue;
        expect(replacedContent.text).not.toContain('{{error}}');
      });
    });

    describe('localization', () => {
      it('returns default file if localization is disabled', async () => {
        delete req.config.pages.enableLocalization;

        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse.calls.all()[0].args[0]).toBeDefined();
        expect(pageResponse.calls.all()[0].args[0]).not.toMatch(
          new RegExp(`\/de(-AT)?\/${pages.invalidLink.defaultFile}`)
        );
      });

      it('returns default file if no locale is specified', async () => {
        delete req.query.locale;

        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse.calls.all()[0].args[0]).toBeDefined();
        expect(pageResponse.calls.all()[0].args[0]).not.toMatch(
          new RegExp(`\/de(-AT)?\/${pages.invalidLink.defaultFile}`)
        );
      });

      it('returns custom page regardless of localization enabled', async () => {
        req.config.customPages = { invalidLink: 'http://invalid-link.example.com' };

        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse).not.toHaveBeenCalled();
        expect(redirectResponse.calls.all()[0].args[0]).toBe(req.config.customPages.invalidLink);
      });

      it('returns file for locale match', async () => {
        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse.calls.all()[0].args[0]).toBeDefined();
        expect(pageResponse.calls.all()[0].args[0]).toMatch(
          new RegExp(`\/de-AT\/${pages.invalidLink.defaultFile}`)
        );
      });

      it('returns file for language match', async () => {
        // Pretend no locale matching file exists
        spyOn(Utils, 'fileExists').and.callFake(async path => {
          return !path.includes(`/de-AT/${pages.invalidLink.defaultFile}`);
        });

        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse.calls.all()[0].args[0]).toBeDefined();
        expect(pageResponse.calls.all()[0].args[0]).toMatch(
          new RegExp(`\/de\/${pages.invalidLink.defaultFile}`)
        );
      });

      it('returns default file for neither locale nor language match', async () => {
        req.query.locale = 'yo-LO';

        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse.calls.all()[0].args[0]).toBeDefined();
        expect(pageResponse.calls.all()[0].args[0]).not.toMatch(
          new RegExp(`\/yo(-LO)?\/${pages.invalidLink.defaultFile}`)
        );
      });

      it('returns a file for GET request', async () => {
        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse).toHaveBeenCalled();
        expect(redirectResponse).not.toHaveBeenCalled();
      });

      it('returns a redirect for POST request', async () => {
        req.method = 'POST';
        await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
        expect(pageResponse).not.toHaveBeenCalled();
        expect(redirectResponse).toHaveBeenCalled();
      });

      it('returns a redirect for custom pages for GET and POST request', async () => {
        req.config.customPages = { invalidLink: 'http://invalid-link.example.com' };

        for (const method of ['GET', 'POST']) {
          req.method = method;
          await expectAsync(router.goToPage(req, pages.invalidLink)).toBeResolved();
          expect(pageResponse).not.toHaveBeenCalled();
          expect(redirectResponse).toHaveBeenCalled();
        }
      });

      it('responds to POST request with redirect response', async () => {
        await reconfigureServer(config);
        const response = await request({
          url:
            'http://localhost:8378/1/apps/test/request_password_reset?token=exampleToken&username=exampleUsername&locale=de-AT',
          followRedirects: false,
          method: 'POST',
        });
        expect(response.status).toEqual(303);
        expect(response.headers.location).toEqual(
          'http://localhost:8378/apps/de-AT/invalid_link.html'
        );
      });

      it('responds to GET request with content response', async () => {
        await reconfigureServer(config);
        const response = await request({
          url:
            'http://localhost:8378/1/apps/test/request_password_reset?token=exampleToken&username=exampleUsername&locale=de-AT',
          followRedirects: false,
          method: 'GET',
        });
        expect(response.status).toEqual(200);
        expect(response.text).toContain('<html>');
      });

      it('localizes end-to-end for password reset success', async () => {
        await reconfigureServer(config);
        const sendPasswordResetEmail = spyOn(config.emailAdapter, 'sendPasswordResetEmail').and.callThrough();
        const user = new Parse.User();
        user.setUsername('exampleUsername');
        user.setPassword('examplePassword');
        user.set('email', 'mail@example.com');
        await user.signUp();
        await Parse.User.requestPasswordReset(user.getEmail());

        const link = sendPasswordResetEmail.calls.all()[0].args[0].link;
        const linkWithLocale = new URL(link);
        linkWithLocale.searchParams.append(pageParams.locale, 'de-AT');

        const linkResponse = await request({
          url: linkWithLocale.toString(),
          followRedirects: false,
        });
        expect(linkResponse.status).toBe(200);

        const appId = linkResponse.headers['x-parse-page-param-appid'];
        const token = linkResponse.headers['x-parse-page-param-token'];
        const locale = linkResponse.headers['x-parse-page-param-locale'];
        const username = linkResponse.headers['x-parse-page-param-username'];
        const publicServerUrl = linkResponse.headers['x-parse-page-param-publicserverurl'];
        const choosePasswordPagePath = pageResponse.calls.all()[0].args[0];
        expect(appId).toBeDefined();
        expect(token).toBeDefined();
        expect(locale).toBeDefined();
        expect(username).toBeDefined();
        expect(publicServerUrl).toBeDefined();
        expect(choosePasswordPagePath).toMatch(
          new RegExp(`\/de-AT\/${pages.choosePassword.defaultFile}`)
        );
        pageResponse.calls.reset();

        const formUrl = `${publicServerUrl}/apps/${appId}/request_password_reset`;
        const formResponse = await request({
          url: formUrl,
          method: 'POST',
          body: {
            token,
            locale,
            username,
            new_password: 'newPassword',
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          followRedirects: false,
        });
        expect(formResponse.status).toEqual(200);
        expect(pageResponse.calls.all()[0].args[0]).toContain(`/${locale}/password_reset_success.html`);
      });
    });
  });
});
