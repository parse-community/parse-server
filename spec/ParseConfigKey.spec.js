const Config = require('../lib/Config');

describe('Config Keys', () => {
  const invalidKeyErrorMessage = 'Invalid key\\(s\\) found in Parse Server configuration';
  let loggerErrorSpy;

  beforeEach(async () => {
    const logger = require('../lib/logger').logger;
    loggerErrorSpy = spyOn(logger, 'error').and.callThrough();
    spyOn(Config, 'validateOptions').and.callFake(() => {});
  });

  it('recognizes invalid keys in root', async () => {
    await expectAsync(reconfigureServer({
      invalidKey: 1,
    })).toBeResolved();
    const error = loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '');
    expect(error).toMatch(invalidKeyErrorMessage);
  });

  it('recognizes invalid keys in pages.customUrls', async () => {
    await expectAsync(reconfigureServer({
      pages: {
        customUrls: {
          invalidKey: 1,
          EmailVerificationSendFail: 1,
        }
      }
    })).toBeResolved();
    const error = loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '');
    expect(error).toMatch(invalidKeyErrorMessage);
    expect(error).toMatch(`invalidKey`);
    expect(error).toMatch(`EmailVerificationSendFail`);
  });

  it('recognizes invalid keys in liveQueryServerOptions', async () => {
    await expectAsync(reconfigureServer({
      liveQueryServerOptions: {
        invalidKey: 1,
        MasterKey: 1,
      }
    })).toBeResolved();
    const error = loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '');
    expect(error).toMatch(invalidKeyErrorMessage);
    expect(error).toMatch(`MasterKey`);
  });

  it('recognizes invalid keys in rateLimit', async () => {
    await expectAsync(reconfigureServer({
      rateLimit: [
        { invalidKey: 1 },
        { RequestPath: 1 },
        { RequestTimeWindow: 1 },
      ]
    })).toBeRejected();
    const error = loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '');
    expect(error).toMatch(invalidKeyErrorMessage);
    expect(error).toMatch('rateLimit\\[0\\]\\.invalidKey');
    expect(error).toMatch('rateLimit\\[1\\]\\.RequestPath');
    expect(error).toMatch('rateLimit\\[2\\]\\.RequestTimeWindow');
  });

  it_only_db('mongo')('recognizes valid keys in default configuration', async () => {
    await expectAsync(reconfigureServer({
      ...defaultConfiguration,
    })).toBeResolved();
    expect(loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '')).not.toMatch(invalidKeyErrorMessage);
  });

  fit_only_db('mongo')('recognizes valid keys in databaseOptions (MongoDB)', async () => {
    await expectAsync(reconfigureServer({
      databaseURI: 'mongodb://localhost:27017/parse',
      filesAdapter: null,
      databaseAdapter: null,
      databaseOptions: {
        appName: 'MyParseApp',
        authMechanism: 'SCRAM-SHA-256',
        authMechanismProperties: { SERVICE_NAME: 'mongodb' },
        authSource: 'admin',
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: 3000,
        compressors: ['snappy', 'zlib'],
        connectTimeoutMS: 5000,
        directConnection: false,
        disableIndexFieldValidation: true,
        forceServerObjectId: false,
        heartbeatFrequencyMS: 10000,
        loadBalanced: false,
        localThresholdMS: 15,
        maxConnecting: 2,
        maxIdleTimeMS: 60000,
        maxPoolSize: 10,
        maxStalenessSeconds: 10,
        maxTimeMS: 1000,
        minPoolSize: 5,
        proxyHost: 'proxy.example.com',
        proxyPassword: 'proxypass',
        proxyPort: 1080,
        proxyUsername: 'proxyuser',
        readConcernLevel: 'majority',
        readPreference: 'secondaryPreferred',
        readPreferenceTags: [{ dc: 'east' }],
        replicaSet: 'myReplicaSet',
        retryReads: true,
        retryWrites: true,
        serverMonitoringMode: 'auto',
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        srvMaxHosts: 0,
        srvServiceName: 'mongodb',
        ssl: false,
        tls: true,
        tlsAllowInvalidCertificates: false,
        tlsAllowInvalidHostnames: false,
        tlsCAFile: '/path/to/ca.pem',
        tlsCertificateKeyFile: '/path/to/cert.pem',
        tlsCertificateKeyFilePassword: 'password',
        tlsInsecure: false,
        waitQueueTimeoutMS: 5000,
        zlibCompressionLevel: 6,
      },
    })).toBeResolved();
    expect(loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '')).not.toMatch(invalidKeyErrorMessage);
  });
});
