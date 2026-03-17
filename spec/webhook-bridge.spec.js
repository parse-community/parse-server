const {
  requestToWebhookBody,
  webhookResponseToResult,
  applyBeforeSaveResponse,
} = require('../lib/cloud-code/adapters/webhook-bridge');
const Parse = require('parse/node').Parse;

describe('webhook-bridge', () => {
  // ── requestToWebhookBody ──────────────────────────────────────────────

  describe('requestToWebhookBody', () => {
    it('should return defaults for a minimal request', () => {
      const body = requestToWebhookBody({});
      expect(body).toEqual({
        master: false,
        ip: '',
        headers: {},
        installationId: undefined,
      });
    });

    it('should pass through master, ip, headers, installationId', () => {
      const body = requestToWebhookBody({
        master: true,
        ip: '127.0.0.1',
        headers: { 'x-custom': 'value' },
        installationId: 'abc-123',
      });
      expect(body.master).toBe(true);
      expect(body.ip).toBe('127.0.0.1');
      expect(body.headers).toEqual({ 'x-custom': 'value' });
      expect(body.installationId).toBe('abc-123');
    });

    it('should serialise user via toJSON when available', () => {
      const user = { toJSON: () => ({ objectId: 'u1', username: 'alice' }) };
      const body = requestToWebhookBody({ user });
      expect(body.user).toEqual({ objectId: 'u1', username: 'alice' });
    });

    it('should use plain user object when toJSON is absent', () => {
      const user = { objectId: 'u2', username: 'bob' };
      const body = requestToWebhookBody({ user });
      expect(body.user).toEqual({ objectId: 'u2', username: 'bob' });
    });

    it('should not include user when it is undefined', () => {
      const body = requestToWebhookBody({});
      expect(Object.hasOwn(body, 'user')).toBe(false);
    });

    it('should include params when defined', () => {
      const body = requestToWebhookBody({ params: { key: 'val' } });
      expect(body.params).toEqual({ key: 'val' });
    });

    it('should not include params when undefined', () => {
      const body = requestToWebhookBody({});
      expect(Object.hasOwn(body, 'params')).toBe(false);
    });

    it('should include jobId when defined', () => {
      const body = requestToWebhookBody({ jobId: 'job-42' });
      expect(body.jobId).toBe('job-42');
    });

    it('should serialise object via toJSON when available', () => {
      const obj = { toJSON: () => ({ className: 'Item', objectId: 'o1' }) };
      const body = requestToWebhookBody({ object: obj });
      expect(body.object).toEqual({ className: 'Item', objectId: 'o1' });
    });

    it('should use plain object when toJSON is absent', () => {
      const obj = { className: 'Item', objectId: 'o1' };
      const body = requestToWebhookBody({ object: obj });
      expect(body.object).toEqual({ className: 'Item', objectId: 'o1' });
    });

    it('should not include object when it is falsy', () => {
      const body = requestToWebhookBody({ object: null });
      expect(Object.hasOwn(body, 'object')).toBe(false);
    });

    it('should serialise original via toJSON when available', () => {
      const original = { toJSON: () => ({ className: 'Item', objectId: 'o0' }) };
      const body = requestToWebhookBody({ original });
      expect(body.original).toEqual({ className: 'Item', objectId: 'o0' });
    });

    it('should use plain original when toJSON is absent', () => {
      const original = { className: 'Item', objectId: 'o0' };
      const body = requestToWebhookBody({ original });
      expect(body.original).toEqual({ className: 'Item', objectId: 'o0' });
    });

    it('should include context when defined', () => {
      const body = requestToWebhookBody({ context: { source: 'test' } });
      expect(body.context).toEqual({ source: 'test' });
    });

    it('should not include context when undefined', () => {
      const body = requestToWebhookBody({});
      expect(Object.hasOwn(body, 'context')).toBe(false);
    });

    it('should map query fields correctly', () => {
      const query = {
        className: 'Item',
        _where: { score: { $gt: 10 } },
        _limit: 25,
        _skip: 5,
        _include: ['author', 'comments'],
        _keys: ['title', 'score'],
        _order: 'score,-createdAt',
      };
      const body = requestToWebhookBody({ query });
      expect(body.query).toEqual({
        className: 'Item',
        where: { score: { $gt: 10 } },
        limit: 25,
        skip: 5,
        include: 'author,comments',
        keys: 'title,score',
        order: 'score,-createdAt',
      });
    });

    it('should handle query with undefined _include and _keys', () => {
      const query = {
        className: 'Item',
        _where: {},
        _limit: 10,
        _skip: 0,
      };
      const body = requestToWebhookBody({ query });
      expect(body.query.include).toBeUndefined();
      expect(body.query.keys).toBeUndefined();
    });

    it('should not include query when undefined', () => {
      const body = requestToWebhookBody({});
      expect(Object.hasOwn(body, 'query')).toBe(false);
    });

    it('should include count when defined', () => {
      const body = requestToWebhookBody({ count: true });
      expect(body.count).toBe(true);
    });

    it('should include isGet when defined', () => {
      const body = requestToWebhookBody({ isGet: true });
      expect(body.isGet).toBe(true);
    });

    it('should include file when defined', () => {
      const file = { name: 'photo.png', data: 'base64...' };
      const body = requestToWebhookBody({ file });
      expect(body.file).toEqual(file);
    });

    it('should not include file when undefined', () => {
      const body = requestToWebhookBody({});
      expect(Object.hasOwn(body, 'file')).toBe(false);
    });

    it('should include fileSize when defined', () => {
      const body = requestToWebhookBody({ fileSize: 1024 });
      expect(body.fileSize).toBe(1024);
    });

    it('should include event when defined', () => {
      const body = requestToWebhookBody({ event: 'create' });
      expect(body.event).toBe('create');
    });

    it('should not include event when undefined', () => {
      const body = requestToWebhookBody({});
      expect(Object.hasOwn(body, 'event')).toBe(false);
    });

    it('should include requestId when defined', () => {
      const body = requestToWebhookBody({ requestId: 'req-99' });
      expect(body.requestId).toBe('req-99');
    });

    it('should include clients when defined', () => {
      const body = requestToWebhookBody({ clients: 5 });
      expect(body.clients).toBe(5);
    });

    it('should include subscriptions when defined', () => {
      const body = requestToWebhookBody({ subscriptions: 12 });
      expect(body.subscriptions).toBe(12);
    });
  });

  // ── webhookResponseToResult ───────────────────────────────────────────

  describe('webhookResponseToResult', () => {
    it('should return success value when response is successful', () => {
      const result = webhookResponseToResult({ success: { name: 'test' } });
      expect(result).toEqual({ name: 'test' });
    });

    it('should return success value when it is a primitive', () => {
      expect(webhookResponseToResult({ success: 42 })).toBe(42);
    });

    it('should return undefined when success is undefined', () => {
      expect(webhookResponseToResult({ success: undefined })).toBeUndefined();
    });

    it('should throw Parse.Error when response contains error', () => {
      const response = { error: { code: 141, message: 'Cloud function failed' } };
      expect(() => webhookResponseToResult(response)).toThrowError(Parse.Error);
      try {
        webhookResponseToResult(response);
      } catch (e) {
        expect(e.code).toBe(141);
        expect(e.message).toBe('Cloud function failed');
      }
    });
  });

  // ── applyBeforeSaveResponse ───────────────────────────────────────────

  describe('applyBeforeSaveResponse', () => {
    let request;

    beforeEach(() => {
      request = {
        object: {
          set: jasmine.createSpy('set'),
        },
      };
    });

    it('should throw Parse.Error when response contains error', () => {
      const response = { error: { code: 101, message: 'Object not found' } };
      expect(() => applyBeforeSaveResponse(request, response)).toThrowError(Parse.Error);
      try {
        applyBeforeSaveResponse(request, response);
      } catch (e) {
        expect(e.code).toBe(101);
        expect(e.message).toBe('Object not found');
      }
    });

    it('should be a no-op when success is an empty object', () => {
      applyBeforeSaveResponse(request, { success: {} });
      expect(request.object.set).not.toHaveBeenCalled();
    });

    it('should set fields from the success object on request.object', () => {
      applyBeforeSaveResponse(request, { success: { title: 'Hello', score: 10 } });
      expect(request.object.set).toHaveBeenCalledWith('title', 'Hello');
      expect(request.object.set).toHaveBeenCalledWith('score', 10);
      expect(request.object.set).toHaveBeenCalledTimes(2);
    });

    it('should skip objectId field', () => {
      applyBeforeSaveResponse(request, { success: { objectId: 'skip-me', title: 'keep' } });
      expect(request.object.set).not.toHaveBeenCalledWith('objectId', jasmine.anything());
      expect(request.object.set).toHaveBeenCalledWith('title', 'keep');
    });

    it('should skip createdAt field', () => {
      applyBeforeSaveResponse(request, { success: { createdAt: '2025-01-01', name: 'ok' } });
      expect(request.object.set).not.toHaveBeenCalledWith('createdAt', jasmine.anything());
      expect(request.object.set).toHaveBeenCalledWith('name', 'ok');
    });

    it('should skip updatedAt field', () => {
      applyBeforeSaveResponse(request, { success: { updatedAt: '2025-01-02', name: 'ok' } });
      expect(request.object.set).not.toHaveBeenCalledWith('updatedAt', jasmine.anything());
      expect(request.object.set).toHaveBeenCalledWith('name', 'ok');
    });

    it('should skip className field', () => {
      applyBeforeSaveResponse(request, { success: { className: 'Item', name: 'ok' } });
      expect(request.object.set).not.toHaveBeenCalledWith('className', jasmine.anything());
      expect(request.object.set).toHaveBeenCalledWith('name', 'ok');
    });

    it('should skip all skip fields at once', () => {
      applyBeforeSaveResponse(request, {
        success: {
          objectId: 'x',
          createdAt: 'a',
          updatedAt: 'b',
          className: 'C',
          realField: 'yes',
        },
      });
      expect(request.object.set).toHaveBeenCalledTimes(1);
      expect(request.object.set).toHaveBeenCalledWith('realField', 'yes');
    });

    it('should not call set when success is null', () => {
      applyBeforeSaveResponse(request, { success: null });
      expect(request.object.set).not.toHaveBeenCalled();
    });

    it('should not call set when success is a primitive', () => {
      applyBeforeSaveResponse(request, { success: 'string-value' });
      expect(request.object.set).not.toHaveBeenCalled();
    });
  });
});
