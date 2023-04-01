const { sign } = require('jsonwebtoken');
const request = require('../lib/request');

describe('Webauthn', () => {
  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-REST-API-Key': 'rest',
  };

  const clientRegistration = {
    id: 'VHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUQ',
    rawId: 'VHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUQ',
    response: {
      attestationObject:
        'o2NmbXRoZmlkby11MmZnYXR0U3RtdKJjc2lnWEcwRQIgRYUftNUmhT0VWTZmIgDmrOoP26Pcre-kL3DLnCrXbegCIQCOu_x5gqp-Rej76zeBuXlk8e7J-9WM_i-wZmCIbIgCGmN4NWOBWQLBMIICvTCCAaWgAwIBAgIEKudiYzANBgkqhkiG9w0BAQsFADAuMSwwKgYDVQQDEyNZdWJpY28gVTJGIFJvb3QgQ0EgU2VyaWFsIDQ1NzIwMDYzMTAgFw0xNDA4MDEwMDAwMDBaGA8yMDUwMDkwNDAwMDAwMFowbjELMAkGA1UEBhMCU0UxEjAQBgNVBAoMCVl1YmljbyBBQjEiMCAGA1UECwwZQXV0aGVudGljYXRvciBBdHRlc3RhdGlvbjEnMCUGA1UEAwweWXViaWNvIFUyRiBFRSBTZXJpYWwgNzE5ODA3MDc1MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKgOGXmBD2Z4R_xCqJVRXhL8Jr45rHjsyFykhb1USGozZENOZ3cdovf5Ke8fj2rxi5tJGn_VnW4_6iQzKdIaeP6NsMGowIgYJKwYBBAGCxAoCBBUxLjMuNi4xLjQuMS40MTQ4Mi4xLjEwEwYLKwYBBAGC5RwCAQEEBAMCBDAwIQYLKwYBBAGC5RwBAQQEEgQQbUS6m_bsLkm5MAyP6SDLczAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4IBAQByV9A83MPhFWmEkNb4DvlbUwcjc9nmRzJjKxHc3HeK7GvVkm0H4XucVDB4jeMvTke0WHb_jFUiApvpOHh5VyMx5ydwFoKKcRs5x0_WwSWL0eTZ5WbVcHkDR9pSNcA_D_5AsUKOBcbpF5nkdVRxaQHuuIuwV4k1iK2IqtMNcU8vL6w21U261xCcWwJ6sMq4zzVO8QCKCQhsoIaWrwz828GDmPzfAjFsJiLJXuYivdHACkeJ5KHMt0mjVLpfJ2BCML7_rgbmvwL7wBW80VHfNdcKmKjkLcpEiPzwcQQhiN_qHV90t-p4iyr5xRSpurlP5zic2hlRkLKxMH2_kRjhqSn4aGF1dGhEYXRhWMQ93EcQ6cCIsinbqJ1WMiC7Ofcimv9GWwplaxr7mor4oEEAAAAAAAAAAAAAAAAAAAAAAAAAAABAVHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUaUBAgMmIAEhWCDIkcsOaVKDIQYwq3EDQ-pST2kRwNH_l1nCgW-WcFpNXiJYIBSbummp-KO3qZeqmvZ_U_uirCDL2RNj3E5y4_KzefIr',
      clientDataJSON:
        'eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sQmRIUmxjM1JoZEdsdmJnIiwiY2xpZW50RXh0ZW5zaW9ucyI6e30sImhhc2hBbGdvcml0aG0iOiJTSEEtMjU2Iiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmNyZWF0ZSJ9',
    },
    clientExtensionResults: {},
    type: 'public-key',
  };
  const registrationOrigin = 'https://dev.dontneeda.pw';
  const registrationRpId = 'dev.dontneeda.pw';
  const registrationChallenge = 'dG90YWxseVVuaXF1ZVZhbHVlRXZlcnlBdHRlc3RhdGlvbg';

  const clientAuthentication = {
    id: 'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
    rawId: 'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
    response: {
      authenticatorData: 'PdxHEOnAiLIp26idVjIguzn3Ipr_RlsKZWsa-5qK-KABAAAAAA',
      clientDataJSON:
        'eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sQmMzTmxjblJwYjI0IiwiY2xpZW50RXh0ZW5zaW9ucyI6e30sImhhc2hBbGdvcml0aG0iOiJTSEEtMjU2Iiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmdldCJ9',
      signature:
        'MEQCIBu6M-DGzu1O8iocGHEj0UaAZm0HmxTeRIE6-nS3_CPjAiBDsmIzy5sacYwwzgpXqfwRt_2vl5yiQZ_OAqWJQBGVsQ',
    },
    type: 'public-key',
  };

  const authenticationChallenge = 'dG90YWxseVVuaXF1ZVZhbHVlRXZlcnlBc3NlcnRpb24';
  const authenticationOrigin = 'https://dev.dontneeda.pw';
  const authenticationRpId = 'dev.dontneeda.pw';
  const authenticationCredential = {
    publicKey:
      'pQECAyYgASFYIGmaxR4mBbukc2QhtW2ldhAAd555r-ljlGQN8MbcTnPPIlgg9CyUlE-0AB2fbzZbNgBvJuRa7r6o2jPphOmtyNPR_kY',
    id: 'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
    counter: 0,
  };

  // Generated from masterKey
  const jwtSecret = '7ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff';

  const callChallenge = async sessionToken => {
    const res = await request({
      headers: {
        ...headers,
        'X-Parse-Session-Token': sessionToken,
      },
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        challengeData: {
          webauthn: true,
        },
      }),
    });
    const {
      challengeData: {
        webauthn: { signedChallenge, options },
      },
    } = JSON.parse(res.text);
    return { signedChallenge, options };
  };
  it('should throw if user not logged and try to register', async () => {
    await reconfigureServer({
      auth: { webauthn: true },
    });

    const user = new Parse.User();
    await expectAsync(
      user.save({ authData: { webauthn: { id: 'webauthn' } } })
    ).toBeRejectedWithError('Webauthn can only be configured on an already logged in user.');
  });
  it('should register if user logged', async () => {
    await reconfigureServer({
      auth: { webauthn: true },
    });
    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });

    const { signedChallenge, options } = await callChallenge(user.getSessionToken());

    expect(typeof signedChallenge).toEqual('string');
    const { challenge, ...otherOptions } = options;
    delete otherOptions.authenticatorSelection.residentKey;
    expect(typeof challenge).toEqual('string');
    expect(otherOptions).toEqual({
      rp: { name: 'Localhost', id: 'localhost' },
      user: { id: user.id, name: 'username', displayName: 'username' },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -8, type: 'public-key' },
        { alg: -36, type: 'public-key' },
        { alg: -37, type: 'public-key' },
        { alg: -38, type: 'public-key' },
        { alg: -39, type: 'public-key' },
        { alg: -257, type: 'public-key' },
        { alg: -258, type: 'public-key' },
        { alg: -259, type: 'public-key' },
      ],
      timeout: 60000,
      attestation: 'indirect',
      excludeCredentials: [],
      authenticatorSelection: { userVerification: 'required', requireResidentKey: false },
    });

    await reconfigureServer({
      auth: { webauthn: { options: { rpId: registrationRpId, origin: registrationOrigin } } },
    });

    await expectAsync(
      user.save(
        {
          authData: {
            webauthn: { registration: clientRegistration, signedChallenge: 'test' },
          },
        },
        { sessionToken: user.getSessionToken() }
      )
    ).toBeRejectedWithError('Invalid signedChallenge');

    await expectAsync(
      user.save(
        {
          authData: {
            webauthn: {
              registration: clientRegistration,
              // Non base 64 challenge
              signedChallenge: sign({ challenge: 'test' }, jwtSecret),
            },
          },
        },
        { sessionToken: user.getSessionToken() }
      )
    ).toBeRejectedWithError('Invalid webauthn registration');

    await expectAsync(
      user.save(
        {
          authData: {
            webauthn: {
              registration: clientRegistration,
              // Incomplete signed challenge
              signedChallenge: sign({}, jwtSecret),
            },
          },
        },
        { sessionToken: user.getSessionToken() }
      )
    ).toBeRejectedWithError('Invalid signedChallenge');

    await expectAsync(
      user.save(
        {
          authData: {
            webauthn: {
              registration: clientRegistration,
              signedChallenge: sign(
                // Wrong base 64 challenge
                { challenge: 'dG90YWxseVVuaXF1ZVZhbHVlRXZlcnlBdHRlc3RhdGlvbw==' },
                jwtSecret
              ),
            },
          },
        },
        { sessionToken: user.getSessionToken() }
      )
    ).toBeRejectedWithError('Invalid webauthn registration');

    await expectAsync(
      user.save(
        {
          authData: {
            webauthn: {
              // Signed challenge not provided
              registration: clientRegistration,
            },
          },
        },
        { sessionToken: user.getSessionToken() }
      )
    ).toBeRejectedWithError('signedChallenge is required.');

    await expectAsync(
      user.save(
        {
          authData: {
            webauthn: {
              // Missing registration
            },
          },
        },
        { sessionToken: user.getSessionToken() }
      )
    ).toBeRejectedWithError('registration is required.');

    await user.save(
      {
        authData: {
          webauthn: {
            registration: clientRegistration,
            signedChallenge: sign({ challenge: registrationChallenge }, jwtSecret),
          },
        },
      },
      { sessionToken: user.getSessionToken() }
    );

    await user.fetch({ useMasterKey: true });
    const webauthnAuthData = user.get('authData').webauthn;
    expect(webauthnAuthData).toBeDefined();
    expect(webauthnAuthData.id).toEqual(clientRegistration.id);
    expect(webauthnAuthData.counter).toEqual(0);
    expect(typeof webauthnAuthData.publicKey).toEqual('string');
  });
  it('should register with master key and already created user', async () => {
    await reconfigureServer({
      auth: { webauthn: true },
    });
    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });

    await reconfigureServer({
      auth: { webauthn: { options: { rpId: registrationRpId, origin: registrationOrigin } } },
    });

    await user.save(
      {
        authData: {
          webauthn: {
            registration: clientRegistration,
            signedChallenge: sign({ challenge: registrationChallenge }, jwtSecret),
          },
        },
      },
      { useMasterKey: true }
    );

    await user.fetch({ useMasterKey: true });
    const webauthnAuthData = user.get('authData').webauthn;
    expect(webauthnAuthData).toBeDefined();
    expect(webauthnAuthData.id).toEqual(clientRegistration.id);
    expect(webauthnAuthData.counter).toEqual(0);
    expect(typeof webauthnAuthData.publicKey).toEqual('string');
  });
  it('should update registered credential', async () => {
    const server = await reconfigureServer({
      auth: { webauthn: { options: { rpId: registrationRpId, origin: registrationOrigin } } },
    });

    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });

    await server.config.databaseController.update(
      '_User',
      { objectId: user.id },
      { authData: { webauthn: { id: 'credId', publicKey: 'test', counter: 6 } } },
      {}
    );
    const fakedSignedChallenge = sign({ challenge: registrationChallenge }, jwtSecret);

    await user.save(
      {
        authData: {
          webauthn: { registration: clientRegistration, signedChallenge: fakedSignedChallenge },
        },
      },
      { sessionToken: user.getSessionToken() }
    );

    await user.fetch({ useMasterKey: true });
    const webauthnAuthData = user.get('authData').webauthn;
    expect(webauthnAuthData).toBeDefined();
    expect(webauthnAuthData.id).toEqual(clientRegistration.id);
    expect(webauthnAuthData.counter).toEqual(0);
    expect(typeof webauthnAuthData.publicKey).toEqual('string');
  });
  it('should login', async () => {
    const server = await reconfigureServer({
      auth: { webauthn: { options: { rpId: authenticationRpId, origin: authenticationOrigin } } },
    });
    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });
    await server.config.databaseController.update(
      '_User',
      { objectId: user.id },
      { authData: { webauthn: authenticationCredential } },
      {}
    );

    const { signedChallenge, options } = await callChallenge();
    expect(typeof signedChallenge).toEqual('string');
    expect(typeof options.challenge).toEqual('string');
    expect(options.timeout).toEqual(60000);

    const user2 = new Parse.User();

    await expectAsync(
      user2.save({
        authData: {
          webauthn: {
            id: authenticationCredential.id,
            // Authentication is missing
          },
        },
      })
    ).toBeRejectedWithError('authentication is required.');

    await expectAsync(
      user2.save({
        authData: {
          webauthn: {
            id: authenticationCredential.id,
            authentication: clientAuthentication,
            signedChallenge: sign({ challenge: 'test' }, jwtSecret),
          },
        },
      })
    ).toBeRejectedWithError('Invalid webauthn authentication');
    await user2.save({
      authData: {
        webauthn: {
          id: authenticationCredential.id,
          authentication: clientAuthentication,
          signedChallenge: sign({ challenge: authenticationChallenge }, jwtSecret),
        },
      },
    });

    expect(user2.getSessionToken()).toBeDefined();
    expect(user2.id).toEqual(user.id);
    await user2.fetch({ useMasterKey: true });
    const webauthnAuthData = user2.get('authData').webauthn;
    expect(webauthnAuthData.publicKey).toEqual(authenticationCredential.publicKey);
    expect(webauthnAuthData.id).toEqual(authenticationCredential.id);
    expect(webauthnAuthData.counter).toEqual(authenticationCredential.counter);
  });
  it('should handle options rpId, rpName, origin, getUsername, getUserDisplayName, attestationType, requireResidentKey', async () => {
    await reconfigureServer({
      auth: { webauthn: true },
    });

    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password', email: 'test@test.test' });

    let options = (await callChallenge(user.getSessionToken())).options;

    expect(options.rp).toEqual({ name: 'Localhost', id: 'localhost' });
    expect(options.user).toEqual({ id: user.id, name: 'username', displayName: 'test@test.test' });

    await reconfigureServer({
      publicServerURL: 'https://example.com/parse',
      auth: {
        webauthn: {
          options: {
            getUserDisplayName: user => {
              return user.get('username').toUpperCase();
            },
          },
        },
      },
    });

    options = (await callChallenge(user.getSessionToken())).options;

    expect(options.rp).toEqual({ name: 'Example', id: 'example.com' });
    expect(options.user).toEqual({ id: user.id, name: 'username', displayName: 'USERNAME' });

    await reconfigureServer({
      publicServerURL: 'https://example.com/parse',
      auth: {
        webauthn: {
          options: {
            rpId: 'my.app.com',
            rpName: 'App',
            origin: 'app.com',
            attestationType: 'direct',
            residentKey: 'required',
            getUserDisplayName: user => user.get('username').toUpperCase(),
            getUsername: user => user.get('username') + user.id,
          },
        },
      },
    });

    options = (await callChallenge(user.getSessionToken())).options;
    expect(options.rp).toEqual({ name: 'App', id: 'my.app.com' });
    expect(options.authenticatorSelection.requireResidentKey).toBeTruthy();
    expect(options.attestation).toEqual('direct');
    expect(options.user).toEqual({
      id: user.id,
      name: 'username' + user.id,
      displayName: 'USERNAME',
    });
  });
});
