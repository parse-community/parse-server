'use strict';
const http = require('http');

function postMultipart(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        method: 'POST',
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        headers,
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildMultipartBody(boundary, parts) {
  const segments = [];
  for (const part of parts) {
    segments.push(`--${boundary}\r\n`);
    if (part.filename) {
      segments.push(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`
      );
      segments.push(`Content-Type: ${part.contentType || 'application/octet-stream'}\r\n\r\n`);
      segments.push(part.data);
    } else {
      segments.push(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`);
      segments.push(part.value);
    }
    segments.push('\r\n');
  }
  segments.push(`--${boundary}--\r\n`);
  return Buffer.concat(segments.map(s => (typeof s === 'string' ? Buffer.from(s) : s)));
}

describe('Cloud Code Multipart', () => {
  it('should not reject multipart requests at the JSON parser level', async () => {
    Parse.Cloud.define('multipartTest', req => {
      return { received: true };
    });

    const boundary = '----TestBoundary123';
    const body = buildMultipartBody(boundary, [
      { name: 'key', value: 'value' },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartTest`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.status).not.toBe(400);
  });

  it('should parse text fields from multipart request', async () => {
    Parse.Cloud.define('multipartText', req => {
      return { userId: req.params.userId, count: req.params.count };
    });

    const boundary = '----TestBoundary456';
    const body = buildMultipartBody(boundary, [
      { name: 'userId', value: 'abc123' },
      { name: 'count', value: '5' },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartText`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.status).toBe(200);
    expect(result.data.result.userId).toBe('abc123');
    expect(result.data.result.count).toBe('5');
  });

  it('should parse file fields from multipart request', async () => {
    Parse.Cloud.define('multipartFile', req => {
      const file = req.params.avatar;
      return {
        filename: file.filename,
        contentType: file.contentType,
        size: file.data.length,
        content: file.data.toString('utf8'),
      };
    });

    const boundary = '----TestBoundary789';
    const fileContent = Buffer.from('hello world');
    const body = buildMultipartBody(boundary, [
      { name: 'avatar', filename: 'photo.txt', contentType: 'text/plain', data: fileContent },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartFile`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.status).toBe(200);
    expect(result.data.result.filename).toBe('photo.txt');
    expect(result.data.result.contentType).toBe('text/plain');
    expect(result.data.result.size).toBe(11);
    expect(result.data.result.content).toBe('hello world');
  });

  it('should parse mixed text and file fields from multipart request', async () => {
    Parse.Cloud.define('multipartMixed', req => {
      return {
        userId: req.params.userId,
        hasAvatar: !!req.params.avatar,
        avatarFilename: req.params.avatar.filename,
      };
    });

    const boundary = '----TestBoundaryMixed';
    const body = buildMultipartBody(boundary, [
      { name: 'userId', value: 'user42' },
      { name: 'avatar', filename: 'img.jpg', contentType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff]) },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartMixed`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.status).toBe(200);
    expect(result.data.result.userId).toBe('user42');
    expect(result.data.result.hasAvatar).toBe(true);
    expect(result.data.result.avatarFilename).toBe('img.jpg');
  });

  it('should parse multiple file fields from multipart request', async () => {
    Parse.Cloud.define('multipartMultiFile', req => {
      return {
        file1Name: req.params.doc1.filename,
        file2Name: req.params.doc2.filename,
        file1Size: req.params.doc1.data.length,
        file2Size: req.params.doc2.data.length,
      };
    });

    const boundary = '----TestBoundaryMulti';
    const body = buildMultipartBody(boundary, [
      { name: 'doc1', filename: 'a.txt', contentType: 'text/plain', data: Buffer.from('aaa') },
      { name: 'doc2', filename: 'b.txt', contentType: 'text/plain', data: Buffer.from('bbbbb') },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartMultiFile`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.status).toBe(200);
    expect(result.data.result.file1Name).toBe('a.txt');
    expect(result.data.result.file2Name).toBe('b.txt');
    expect(result.data.result.file1Size).toBe(3);
    expect(result.data.result.file2Size).toBe(5);
  });

  it('should handle empty file field from multipart request', async () => {
    Parse.Cloud.define('multipartEmptyFile', req => {
      return {
        filename: req.params.empty.filename,
        size: req.params.empty.data.length,
      };
    });

    const boundary = '----TestBoundaryEmpty';
    const body = buildMultipartBody(boundary, [
      { name: 'empty', filename: 'empty.bin', contentType: 'application/octet-stream', data: Buffer.alloc(0) },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartEmptyFile`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.status).toBe(200);
    expect(result.data.result.filename).toBe('empty.bin');
    expect(result.data.result.size).toBe(0);
  });

  it('should still handle JSON requests as before', async () => {
    Parse.Cloud.define('jsonTest', req => {
      return { name: req.params.name, count: req.params.count };
    });

    const result = await Parse.Cloud.run('jsonTest', { name: 'hello', count: 42 });

    expect(result.name).toBe('hello');
    expect(result.count).toBe(42);
  });

  it('should reject multipart request exceeding maxUploadSize', async () => {
    await reconfigureServer({ maxUploadSize: '1kb' });

    Parse.Cloud.define('multipartLarge', req => {
      return { ok: true };
    });

    const boundary = '----TestBoundaryLarge';
    const largeData = Buffer.alloc(2 * 1024, 'x');
    const body = buildMultipartBody(boundary, [
      { name: 'bigfile', filename: 'large.bin', contentType: 'application/octet-stream', data: largeData },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartLarge`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.data.code).toBe(Parse.Error.OBJECT_TOO_LARGE);
  });

  it('should reject multipart request exceeding maxUploadSize via file stream', async () => {
    await reconfigureServer({ maxUploadSize: '1kb' });

    Parse.Cloud.define('multipartLargeFile', req => {
      return { ok: true };
    });

    const boundary = '----TestBoundaryLargeFile';
    const body = buildMultipartBody(boundary, [
      { name: 'small', value: 'ok' },
      { name: 'bigfile', filename: 'large.bin', contentType: 'application/octet-stream', data: Buffer.alloc(2 * 1024, 'x') },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartLargeFile`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.data.code).toBe(Parse.Error.OBJECT_TOO_LARGE);
  });

  it('should reject malformed multipart body', async () => {
    Parse.Cloud.define('multipartMalformed', req => {
      return { ok: true };
    });

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartMalformed`,
      {
        'Content-Type': 'multipart/form-data; boundary=----TestBoundaryBad',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      Buffer.from('this is not valid multipart data')
    );

    expect(result.data.code).toBe(Parse.Error.INVALID_JSON);
  });

  it('should not allow prototype pollution via __proto__ field name', async () => {
    Parse.Cloud.define('multipartProto', req => {
      const obj = {};
      return {
        polluted: obj.polluted !== undefined,
        paramsClean: Object.getPrototypeOf(req.params) === Object.prototype,
      };
    });

    const boundary = '----TestBoundaryProto';
    const body = buildMultipartBody(boundary, [
      { name: '__proto__', value: '{"polluted":"yes"}' },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartProto`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.status).toBe(200);
    expect(result.data.result.polluted).toBe(false);
    expect(result.data.result.paramsClean).toBe(true);
  });

  it('should not grant master key access via multipart fields', async () => {
    const obj = new Parse.Object('SecretClass');
    await obj.save(null, { useMasterKey: true });

    Parse.Cloud.define('multipartAuthCheck', req => {
      return { isMaster: req.master };
    });

    const boundary = '----TestBoundaryAuth';
    const body = buildMultipartBody(boundary, [
      { name: '_MasterKey', value: 'test' },
    ]);

    const result = await postMultipart(
      `http://localhost:8378/1/functions/multipartAuthCheck`,
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body
    );

    expect(result.status).toBe(200);
    expect(result.data.result.isMaster).toBe(false);
  });
});
