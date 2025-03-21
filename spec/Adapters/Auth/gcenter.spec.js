const GameCenterAuth = require('../../../lib/Adapters/Auth/gcenter').default;
const { pki } = require('node-forge');
const fs = require('fs');
const path = require('path');

describe('GameCenterAuth Adapter', function () {
  let adapter;

  beforeEach(function () {
    adapter = new GameCenterAuth.constructor();

    const gcProd4 = fs.readFileSync(path.resolve(__dirname, '../../support/cert/gc-prod-4.cer'));
    const digicertPem = fs.readFileSync(path.resolve(__dirname, '../../support/cert/DigiCertTrustedG4CodeSigningRSA4096SHA3842021CA1.crt.pem')).toString();

   mockFetch([
    {
      url: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
      method: 'GET',
      response: {
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(
          gcProd4.buffer.slice(gcProd4.byteOffset, gcProd4.byteOffset + gcProd4.length)
        ),
      },
    },
    {
      url: 'https://cacerts.digicert.com/DigiCertTrustedG4CodeSigningRSA4096SHA3842021CA1.crt.pem',
      method: 'GET',
      response: {
        ok: true,
        headers: new Map([['content-type', 'application/x-pem-file'], ['content-length', digicertPem.length.toString()]]),
        text: () => Promise.resolve(digicertPem),
      },
    }
  ]);
  });

  describe('Test config failing due to missing params or wrong types', function () {
    it('should throw error for invalid options', async function () {
      const invalidOptions = [
        null,
        undefined,
        {},
        { bundleId: '' },
        { enableInsecureAuth: false }, // Missing bundleId in secure mode
      ];

      for (const options of invalidOptions) {
        expect(() => adapter.validateOptions(options)).withContext(JSON.stringify(options)).toThrow()
      }
    });

    it('should validate options successfully with valid parameters', function () {
      const validOptions = { bundleId: 'com.valid.app', enableInsecureAuth: false };
      expect(() => adapter.validateOptions(validOptions)).not.toThrow();
    });
  });

  describe('Test payload failing due to missing params or wrong types', function () {
    it('should throw error for missing authData fields', async function () {
      await expectAsync(adapter.validateAuthData({})).toBeRejectedWithError(
        'AuthData id is missing.'
      );
    });
  });

  describe('Test payload fails due to incorrect appId / certificate', function () {
    it('should throw error for invalid publicKeyUrl', async function () {
      const invalidPublicKeyUrl = 'https://malicious.url.com/key.cer';

      spyOn(adapter, 'fetchCertificate').and.throwError(
        new Error('Invalid publicKeyUrl')
      );

      await expectAsync(
        adapter.getAppleCertificate(invalidPublicKeyUrl)
      ).toBeRejectedWithError('Invalid publicKeyUrl: https://malicious.url.com/key.cer');
    });

    it('should throw error for invalid signature verification', async function () {
      const fakePublicKey = 'invalid-key';
      const fakeAuthData = {
        id: '1234567',
        publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
        timestamp: 1460981421303,
        salt: 'saltST==',
        signature: 'invalidSignature',
      };

      spyOn(adapter, 'getAppleCertificate').and.returnValue(Promise.resolve(fakePublicKey));
      spyOn(adapter, 'verifySignature').and.throwError('Invalid signature.');

      await expectAsync(adapter.validateAuthData(fakeAuthData)).toBeRejectedWithError(
        'Invalid signature.'
      );
    });
  });

  describe('Test payload passing', function () {
    it('should successfully process valid payload and save auth data', async function () {
      const validAuthData = {
        id: '1234567',
        publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
        timestamp: 1460981421303,
        salt: 'saltST==',
        signature: 'validSignature',
        bundleId: 'com.valid.app',
      };

      spyOn(adapter, 'getAppleCertificate').and.returnValue(Promise.resolve('validKey'));
      spyOn(adapter, 'verifySignature').and.returnValue(true);

      await expectAsync(adapter.validateAuthData(validAuthData)).toBeResolved();
    });
  });

  describe('Certificate and Signature Validation', function () {
    it('should fetch and validate Apple certificate', async function () {
      const certUrl = 'https://static.gc.apple.com/public-key/gc-prod-4.cer';
      const mockCertificate = 'mockCertificate';

      spyOn(adapter, 'fetchCertificate').and.returnValue(
        Promise.resolve({ certificate: mockCertificate, headers: new Map() })
      );
      spyOn(pki, 'certificateFromPem').and.returnValue({});

      adapter.cache[certUrl] = mockCertificate;

      const cert = await adapter.getAppleCertificate(certUrl);
      expect(cert).toBe(mockCertificate);
    });

    it('should verify signature successfully', async function () {
      const authData = {
        id: 'G:1965586982',
        publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
        timestamp: 1565257031287,
        signature:
          'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
        salt: 'DzqqrQ==',
      };

      adapter.bundleId = 'cloud.xtralife.gamecenterauth';
      adapter.enableInsecureAuth = false;

      spyOn(adapter, 'verifyPublicKeyIssuer').and.returnValue();

      const publicKey = await adapter.getAppleCertificate(authData.publicKeyUrl);

      expect(() => adapter.verifySignature(publicKey, authData)).not.toThrow();

    });

    it('should not use bundle id from authData payload in secure mode', async function () {
      const authData = {
        id: 'G:1965586982',
        publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
        timestamp: 1565257031287,
        signature:
          'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
        salt: 'DzqqrQ==',
        bundleId: 'com.example.insecure.app',
      };

      adapter.bundleId = 'cloud.xtralife.gamecenterauth';
      adapter.enableInsecureAuth = false;

      spyOn(adapter, 'verifyPublicKeyIssuer').and.returnValue();

      const publicKey = await adapter.getAppleCertificate(authData.publicKeyUrl);

      expect(() => adapter.verifySignature(publicKey, authData)).not.toThrow();

    });

    it('should not use bundle id from authData payload in insecure mode', async function () {
      const authData = {
        id: 'G:1965586982',
        publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
        timestamp: 1565257031287,
        signature:
          'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
        salt: 'DzqqrQ==',
        bundleId: 'com.example.insecure.app',
      };

      adapter.bundleId = 'cloud.xtralife.gamecenterauth';
      adapter.enableInsecureAuth = true;

      spyOn(adapter, 'verifyPublicKeyIssuer').and.returnValue();

      const publicKey = await adapter.getAppleCertificate(authData.publicKeyUrl);

      expect(() => adapter.verifySignature(publicKey, authData)).not.toThrow();

    });

    it('can  use bundle id from authData payload in insecure mode', async function () {
      const authData = {
        id: 'G:1965586982',
        publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
        timestamp: 1565257031287,
        signature:
          'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
        salt: 'DzqqrQ==',
        bundleId: 'cloud.xtralife.gamecenterauth',
      };

      adapter.enableInsecureAuth = true;

      spyOn(adapter, 'verifyPublicKeyIssuer').and.returnValue();

      const publicKey = await adapter.getAppleCertificate(authData.publicKeyUrl);

      expect(() => adapter.verifySignature(publicKey, authData)).not.toThrow();

    });
  });
});
