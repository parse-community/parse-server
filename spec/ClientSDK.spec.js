var ClientSDK = require('../src/ClientSDK');

describe('ClientSDK', () => {
  it('should properly parse the SDK versions', () => {
    const clientSDKFromVersion = ClientSDK.fromString;
    expect(clientSDKFromVersion('i1.1.1')).toEqual({
      sdk: 'i',
      version: '1.1.1'
    });
    expect(clientSDKFromVersion('i1')).toEqual({
      sdk: 'i',
      version: '1'
    });
    expect(clientSDKFromVersion('apple-tv1.13.0')).toEqual({
      sdk: 'apple-tv',
      version: '1.13.0'
    });
    expect(clientSDKFromVersion('js1.9.0')).toEqual({
      sdk: 'js',
      version: '1.9.0'
    });
  });

  it('should properly sastisfy', () => {
    expect(ClientSDK.compatible({
      js: '>=1.9.0'
    })("js1.9.0")).toBe(true);

    expect(ClientSDK.compatible({
      js: '>=1.9.0'
    })("js2.0.0")).toBe(true);

    expect(ClientSDK.compatible({
      js: '>=1.9.0'
    })("js1.8.0")).toBe(false);

    expect(ClientSDK.compatible({
      js: '>=1.9.0'
    })(undefined)).toBe(true);
  })
})
