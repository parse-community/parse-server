'use strict';

describe('fileDownload', () => {
  describe('config validation', () => {
    it('should default all flags to true when fileDownload is undefined', async () => {
      await reconfigureServer({ fileDownload: undefined });
      const Config = require('../lib/Config');
      const config = Config.get(Parse.applicationId);
      expect(config.fileDownload.enableForAnonymousUser).toBe(true);
      expect(config.fileDownload.enableForAuthenticatedUser).toBe(true);
      expect(config.fileDownload.enableForPublic).toBe(true);
    });

    it('should accept valid boolean values', async () => {
      await reconfigureServer({
        fileDownload: {
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: false,
          enableForPublic: false,
        },
      });
      const Config = require('../lib/Config');
      const config = Config.get(Parse.applicationId);
      expect(config.fileDownload.enableForAnonymousUser).toBe(false);
      expect(config.fileDownload.enableForAuthenticatedUser).toBe(false);
      expect(config.fileDownload.enableForPublic).toBe(false);
    });

    it('should reject non-object values', async () => {
      for (const value of ['string', 123, true, []]) {
        await expectAsync(reconfigureServer({ fileDownload: value })).toBeRejected();
      }
    });

    it('should reject non-boolean flag values', async () => {
      await expectAsync(
        reconfigureServer({ fileDownload: { enableForAnonymousUser: 'yes' } })
      ).toBeRejected();
      await expectAsync(
        reconfigureServer({ fileDownload: { enableForAuthenticatedUser: 1 } })
      ).toBeRejected();
      await expectAsync(
        reconfigureServer({ fileDownload: { enableForPublic: null } })
      ).toBeRejected();
    });
  });

  describe('permissions', () => {
    async function uploadTestFile() {
      const request = require('../lib/request');
      const res = await request({
        headers: {
          'Content-Type': 'text/plain',
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
        method: 'POST',
        url: 'http://localhost:8378/1/files/test.txt',
        body: 'hello world',
      });
      return res.data;
    }

    it('should allow public download by default', async () => {
      await reconfigureServer();
      const file = await uploadTestFile();
      const request = require('../lib/request');
      const res = await request({
        method: 'GET',
        url: file.url,
      });
      expect(res.status).toBe(200);
    });

    it('should block public download when enableForPublic is false', async () => {
      await reconfigureServer({
        fileDownload: { enableForPublic: false },
      });
      const file = await uploadTestFile();
      const request = require('../lib/request');
      try {
        await request({
          method: 'GET',
          url: file.url,
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it('should allow authenticated user download when enableForAuthenticatedUser is true', async () => {
      await reconfigureServer({
        fileDownload: { enableForPublic: false, enableForAuthenticatedUser: true },
      });
      const file = await uploadTestFile();
      const user = new Parse.User();
      user.set('username', 'testuser');
      user.set('password', 'testpass');
      await user.signUp();
      const request = require('../lib/request');
      const res = await request({
        headers: {
          'X-Parse-Session-Token': user.getSessionToken(),
        },
        method: 'GET',
        url: file.url,
      });
      expect(res.status).toBe(200);
    });

    it('should block authenticated user download when enableForAuthenticatedUser is false', async () => {
      await reconfigureServer({
        fileDownload: { enableForAuthenticatedUser: false },
      });
      const file = await uploadTestFile();
      const user = new Parse.User();
      user.set('username', 'testuser');
      user.set('password', 'testpass');
      await user.signUp();
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Session-Token': user.getSessionToken(),
          },
          method: 'GET',
          url: file.url,
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it('should block anonymous user download when enableForAnonymousUser is false', async () => {
      await reconfigureServer({
        fileDownload: { enableForAnonymousUser: false },
      });
      const file = await uploadTestFile();
      const user = await Parse.AnonymousUtils.logIn();
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Session-Token': user.getSessionToken(),
          },
          method: 'GET',
          url: file.url,
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it('should allow anonymous user download when enableForAnonymousUser is true', async () => {
      await reconfigureServer({
        fileDownload: { enableForAnonymousUser: true, enableForPublic: false },
      });
      const file = await uploadTestFile();
      const user = await Parse.AnonymousUtils.logIn();
      const request = require('../lib/request');
      const res = await request({
        headers: {
          'X-Parse-Session-Token': user.getSessionToken(),
        },
        method: 'GET',
        url: file.url,
      });
      expect(res.status).toBe(200);
    });

    it('should allow master key to bypass all restrictions', async () => {
      await reconfigureServer({
        fileDownload: {
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: false,
          enableForPublic: false,
        },
      });
      const file = await uploadTestFile();
      const request = require('../lib/request');
      const res = await request({
        headers: {
          'X-Parse-Master-Key': 'test',
        },
        method: 'GET',
        url: file.url,
      });
      expect(res.status).toBe(200);
    });

    it('should block metadata endpoint when download is disabled for public', async () => {
      await reconfigureServer({
        fileDownload: { enableForPublic: false },
      });
      const file = await uploadTestFile();
      const request = require('../lib/request');
      // The file URL is like http://localhost:8378/1/files/test/abc_test.txt
      // The metadata URL replaces /files/APPID/ with /files/APPID/metadata/
      const url = new URL(file.url);
      const pathParts = url.pathname.split('/');
      // pathParts: ['', '1', 'files', 'test', 'abc_test.txt']
      const appIdIndex = pathParts.indexOf('files') + 1;
      pathParts.splice(appIdIndex + 1, 0, 'metadata');
      url.pathname = pathParts.join('/');
      try {
        await request({
          method: 'GET',
          url: url.toString(),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it('should block all downloads when all flags are false', async () => {
      await reconfigureServer({
        fileDownload: {
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: false,
          enableForPublic: false,
        },
      });
      const file = await uploadTestFile();
      const request = require('../lib/request');
      try {
        await request({
          method: 'GET',
          url: file.url,
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it('should allow maintenance key to bypass download restrictions', async () => {
      await reconfigureServer({
        fileDownload: {
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: false,
          enableForPublic: false,
        },
      });
      const file = await uploadTestFile();
      const request = require('../lib/request');
      const res = await request({
        headers: {
          'X-Parse-Maintenance-Key': 'testing',
        },
        method: 'GET',
        url: file.url,
      });
      expect(res.status).toBe(200);
    });

    it('should allow maintenance key to bypass upload restrictions', async () => {
      await reconfigureServer({
        fileUpload: {
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: false,
          enableForPublic: false,
        },
      });
      const request = require('../lib/request');
      const res = await request({
        headers: {
          'Content-Type': 'text/plain',
          'X-Parse-Application-Id': 'test',
          'X-Parse-Maintenance-Key': 'testing',
        },
        method: 'POST',
        url: 'http://localhost:8378/1/files/test.txt',
        body: 'hello world',
      });
      expect(res.data.url).toBeDefined();
    });
  });
});
