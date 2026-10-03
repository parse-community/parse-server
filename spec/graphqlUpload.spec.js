'use strict';

const http = require('http');
const { createGraphQLUploadMiddleware } = require('../lib/GraphQL/helpers/graphqlUpload');
const { handleUpload } = require('../lib/GraphQL/loaders/filesMutations');

const createMockReadStream = () => {
  const stream = {
    pipe(destination) {
      setImmediate(() => {
        if (stream.endHandler) {
          stream.endHandler();
        }
      });
      return destination;
    },
    on(event, handler) {
      if (event === 'end') {
        stream.endHandler = handler;
      }
    },
    destroy() {},
  };
  return stream;
};

const createMockHttpResponse = (statusCode, body) => ({
  statusCode,
  on(event, handler) {
    if (event === 'data') {
      handler(body);
    }
    if (event === 'end') {
      handler();
    }
  },
});

describe('graphqlUpload helper', () => {
  it('skips middleware for non-multipart requests', async () => {
    const middleware = createGraphQLUploadMiddleware({ maxFileSize: 1000 });
    const req = { is: type => type !== 'multipart/form-data' };
    const next = jasmine.createSpy('next');

    await middleware(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toBeUndefined();
  });

  it('forwards multipart parsing errors to Express', async () => {
    const middleware = createGraphQLUploadMiddleware({ maxFileSize: 1000 });
    const req = {
      is: () => true,
      headers: { 'content-type': 'multipart/form-data; boundary=----parse' },
    };
    const next = jasmine.createSpy('next');

    await middleware(req, {}, next);

    expect(next).toHaveBeenCalledWith(jasmine.any(Error));
  });
});

describe('filesMutations handleUpload', () => {
  const upload = {
    createReadStream: createMockReadStream,
    filename: 'café.txt',
    mimetype: 'text/plain',
  };
  const config = {
    serverURL: 'http://localhost:8378/1',
    headers: {},
  };

  afterEach(() => {
    if (jasmine.isSpy(http.request)) {
      http.request.and.callThrough();
    }
  });

  it('rejects non-2xx responses from the internal /files handoff', async () => {
    spyOn(http, 'request').and.callFake((_options, callback) => {
      const req = { on() {}, end() {} };
      setImmediate(() => {
        callback(createMockHttpResponse(400, JSON.stringify({ code: 130, error: 'bad upload' })));
      });
      return req;
    });

    await expectAsync(
      handleUpload(Promise.resolve(upload), config)
    ).toBeRejectedWith(jasmine.objectContaining({ code: 130 }));
  });

  it('rejects invalid JSON responses from the internal /files handoff', async () => {
    spyOn(http, 'request').and.callFake((_options, callback) => {
      const req = { on() {}, end() {} };
      setImmediate(() => {
        callback(createMockHttpResponse(200, 'not-json'));
      });
      return req;
    });

    await expectAsync(
      handleUpload(Promise.resolve(upload), config)
    ).toBeRejectedWith(jasmine.objectContaining({ code: Parse.Error.FILE_SAVE_ERROR }));
  });

  it('wraps request failures in FILE_SAVE_ERROR', async () => {
    spyOn(http, 'request').and.throwError('connection failed');

    await expectAsync(
      handleUpload(Promise.resolve(upload), config)
    ).toBeRejectedWith(jasmine.objectContaining({ code: Parse.Error.FILE_SAVE_ERROR }));
  });
});
