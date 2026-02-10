'use strict';

const { validateFileUrl, validateFileUrlsInObject } = require('../src/FileUrlValidator');

describe('FileUrlValidator', () => {
  describe('validateFileUrl', () => {
    it('allows null, undefined, and empty string URLs', () => {
      const config = { fileUpload: { allowedFileUrlDomains: [] } };
      expect(() => validateFileUrl(null, config)).not.toThrow();
      expect(() => validateFileUrl(undefined, config)).not.toThrow();
      expect(() => validateFileUrl('', config)).not.toThrow();
    });

    it('allows any URL when allowedFileUrlDomains contains wildcard', () => {
      const config = { fileUpload: { allowedFileUrlDomains: ['*'] } };
      expect(() => validateFileUrl('http://malicious.example.com/file.txt', config)).not.toThrow();
      expect(() => validateFileUrl('http://malicious.example.com/leak', config)).not.toThrow();
    });

    it('allows any URL when allowedFileUrlDomains is not an array', () => {
      expect(() => validateFileUrl('http://example.com/file', {})).not.toThrow();
      expect(() => validateFileUrl('http://example.com/file', { fileUpload: {} })).not.toThrow();
      expect(() => validateFileUrl('http://example.com/file', null)).not.toThrow();
    });

    it('rejects all URLs when allowedFileUrlDomains is empty', () => {
      const config = { fileUpload: { allowedFileUrlDomains: [] } };
      expect(() => validateFileUrl('http://example.com/file', config)).toThrowError(
        /not allowed/
      );
    });

    it('allows URLs matching exact hostname', () => {
      const config = { fileUpload: { allowedFileUrlDomains: ['cdn.example.com'] } };
      expect(() => validateFileUrl('https://cdn.example.com/files/test.txt', config)).not.toThrow();
    });

    it('rejects URLs not matching any allowed hostname', () => {
      const config = { fileUpload: { allowedFileUrlDomains: ['cdn.example.com'] } };
      expect(() => validateFileUrl('http://malicious.example.com/file', config)).toThrowError(
        /not allowed/
      );
    });

    it('supports wildcard subdomain matching', () => {
      const config = { fileUpload: { allowedFileUrlDomains: ['*.example.com'] } };
      expect(() => validateFileUrl('https://cdn.example.com/file.txt', config)).not.toThrow();
      expect(() => validateFileUrl('https://us-east.cdn.example.com/file.txt', config)).not.toThrow();
      expect(() => validateFileUrl('https://example.net/file.txt', config)).toThrowError(
        /not allowed/
      );
    });

    it('performs case-insensitive hostname matching', () => {
      const config = { fileUpload: { allowedFileUrlDomains: ['CDN.Example.COM'] } };
      expect(() => validateFileUrl('https://cdn.example.com/file.txt', config)).not.toThrow();
    });

    it('throws on invalid URL strings', () => {
      const config = { fileUpload: { allowedFileUrlDomains: ['example.com'] } };
      expect(() => validateFileUrl('not-a-url', config)).toThrowError(
        /Invalid file URL/
      );
    });

    it('supports multiple allowed domains', () => {
      const config = { fileUpload: { allowedFileUrlDomains: ['cdn1.example.com', 'cdn2.example.com'] } };
      expect(() => validateFileUrl('https://cdn1.example.com/file.txt', config)).not.toThrow();
      expect(() => validateFileUrl('https://cdn2.example.com/file.txt', config)).not.toThrow();
      expect(() => validateFileUrl('https://cdn3.example.com/file.txt', config)).toThrowError(
        /not allowed/
      );
    });

    it('does not allow partial hostname matches', () => {
      const config = { fileUpload: { allowedFileUrlDomains: ['example.com'] } };
      expect(() => validateFileUrl('https://notexample.com/file.txt', config)).toThrowError(
        /not allowed/
      );
      expect(() => validateFileUrl('https://example.com.malicious.example.com/file.txt', config)).toThrowError(
        /not allowed/
      );
    });
  });

  describe('validateFileUrlsInObject', () => {
    const config = { fileUpload: { allowedFileUrlDomains: ['example.com'] } };

    it('validates file URLs in flat objects', () => {
      expect(() =>
        validateFileUrlsInObject(
          { file: { __type: 'File', name: 'test.txt', url: 'http://malicious.example.com/file' } },
          config
        )
      ).toThrowError(/not allowed/);
    });

    it('validates file URLs in nested objects', () => {
      expect(() =>
        validateFileUrlsInObject(
          { nested: { deep: { file: { __type: 'File', name: 'test.txt', url: 'http://malicious.example.com/file' } } } },
          config
        )
      ).toThrowError(/not allowed/);
    });

    it('validates file URLs in arrays', () => {
      expect(() =>
        validateFileUrlsInObject(
          [{ __type: 'File', name: 'test.txt', url: 'http://malicious.example.com/file' }],
          config
        )
      ).toThrowError(/not allowed/);
    });

    it('allows files without URLs', () => {
      expect(() =>
        validateFileUrlsInObject(
          { file: { __type: 'File', name: 'test.txt' } },
          config
        )
      ).not.toThrow();
    });

    it('allows files with permitted URLs', () => {
      expect(() =>
        validateFileUrlsInObject(
          { file: { __type: 'File', name: 'test.txt', url: 'http://example.com/file.txt' } },
          config
        )
      ).not.toThrow();
    });

    it('handles null, undefined, and primitive values', () => {
      expect(() => validateFileUrlsInObject(null, config)).not.toThrow();
      expect(() => validateFileUrlsInObject(undefined, config)).not.toThrow();
      expect(() => validateFileUrlsInObject('string', config)).not.toThrow();
      expect(() => validateFileUrlsInObject(42, config)).not.toThrow();
    });
  });
});
