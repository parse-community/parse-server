'use strict';
/* Tests for ParseServer.js */
const express = require('express');
const ParseServer = require('../lib/ParseServer').default;
const path = require('path');
const { spawn } = require('child_process');

describe('Server Url Checks', () => {
  let server;
  beforeEach(done => {
    if (!server) {
      const app = express();
      app.get('/health', function (req, res) {
        res.json({
          status: 'ok',
        });
      });
      server = app.listen(13376, undefined, done);
    } else {
      done();
    }
  });

  afterAll(done => {
    Parse.serverURL = 'http://localhost:8378/1';
    server.close(done);
  });

  it('validate good server url', async () => {
    Parse.serverURL = 'http://localhost:13376';
    const response = await ParseServer.verifyServerUrl();
    expect(response).toBeTrue();
  });

  it('mark bad server url', async () => {
    spyOn(console, 'warn').and.callFake(() => {});
    Parse.serverURL = 'notavalidurl';
    const response = await ParseServer.verifyServerUrl();
    expect(response).not.toBeTrue();
    expect(console.warn).toHaveBeenCalledWith(
      `\nWARNING, Unable to connect to 'notavalidurl' as the URL is invalid. Cloud code and push notifications may be unavailable!\n`
    );
  });

  it('aborts the server url verification while the server does not respond', async () => {
    const net = require('net');
    const sockets = [];
    const silentServer = net.createServer(socket => sockets.push(socket));
    await new Promise(resolve => silentServer.listen(0, resolve));
    Parse.serverURL = `http://localhost:${silentServer.address().port}`;
    spyOn(console, 'warn').and.callFake(() => {});
    const controller = new AbortController();
    const verification = ParseServer.verifyServerUrl(controller.signal);
    await new Promise(resolve => silentServer.once('connection', resolve));
    const started = Date.now();
    controller.abort();
    expect(await verification).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(500);
    expect(console.warn).not.toHaveBeenCalled();
    sockets.forEach(socket => socket.destroy());
    await new Promise(resolve => silentServer.close(resolve));
  });

  it('aborts the server url verification while waiting to retry', async () => {
    const app = express();
    let requests = 0;
    app.get('/health', (req, res) => {
      requests += 1;
      res.set('Retry-After', '1').status(503).json({ status: 'starting' });
    });
    const startingServer = await new Promise(resolve => {
      const httpServer = app.listen(0, () => resolve(httpServer));
    });
    Parse.serverURL = `http://localhost:${startingServer.address().port}`;
    spyOn(console, 'warn').and.callFake(() => {});
    const controller = new AbortController();
    const verification = ParseServer.verifyServerUrl(controller.signal);
    await new Promise(resolve => startingServer.once('request', resolve));
    await new Promise(resolve => setTimeout(resolve, 100));
    const started = Date.now();
    controller.abort();
    expect(await verification).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(500);
    expect(requests).toBe(1);
    expect(console.warn).not.toHaveBeenCalled();
    await new Promise(resolve => startingServer.close(resolve));
  });

  it('does not have unhandled promise rejection in the case of load error', done => {
    const parseServerProcess = spawn(path.resolve(__dirname, './support/FailingServer.js'));
    let stdout;
    let stderr;
    parseServerProcess.stdout.on('data', data => {
      stdout = data.toString();
    });
    parseServerProcess.stderr.on('data', data => {
      stderr = data.toString();
    });
    parseServerProcess.on('close', async code => {
      expect(code).toEqual(1);
      expect(stdout).not.toContain('UnhandledPromiseRejectionWarning');
      expect(stderr).toContain('Database error');
      await reconfigureServer();
      done();
    });
  });
});

describe('graceful shutdown', () => {
  const request = require('../lib/request');
  const triggers = require('../lib/triggers');
  const { sleep } = require('../lib/TestUtils');
  const { GridFSBucketAdapter } = require('../lib/Adapters/Files/GridFSBucketAdapter');
  const http = require('http');
  const net = require('net');
  const port = 13377;
  const appId = 'lifecycle_test';
  const masterKey = 'lifecycle_test_master';
  const headers = {
    'X-Parse-Application-Id': appId,
    'X-Parse-Master-Key': masterKey,
    'Content-Type': 'application/json',
  };
  let server;

  const makeConfig = options => {
    const config = Object.assign(
      {},
      defaultConfiguration,
      {
        appId,
        masterKey,
        port,
        mountPath: '/1',
        serverURL: `http://localhost:${port}/1`,
        silent: true,
        verbose: false,
      },
      options
    );
    // Own adapters against the test database so that shutting them down does not affect the
    // shared test server and the data is cleaned up with the other test collections
    config.databaseAdapter = new databaseAdapter.constructor({
      uri: databaseURI,
      collectionPrefix: 'test_',
    });
    config.filesAdapter =
      process.env.PARSE_SERVER_TEST_DB === 'postgres'
        ? defaultConfiguration.filesAdapter
        : new GridFSBucketAdapter(databaseURI);
    return config;
  };

  // Every check uses a fresh connection so that pooled keep-alive sockets do not mask the server state
  const freshAgent = () => new http.Agent({ keepAlive: false });
  const health = () =>
    request({ url: `http://localhost:${port}/1/health`, json: true, headers, agent: freshAgent() }).catch(
      e => e
    );
  const createObject = () =>
    request({
      method: 'POST',
      url: `http://localhost:${port}/1/classes/LifecycleTest`,
      json: true,
      headers,
      body: { foo: 'bar' },
      agent: freshAgent(),
    }).catch(e => e);
  const callSlowFunction = () =>
    request({
      method: 'POST',
      url: `http://localhost:${port}/1/functions/slow`,
      json: true,
      headers,
      body: {},
      agent: new http.Agent({ keepAlive: true }),
    }).catch(e => e);

  // Opens a raw keep-alive connection, performs one request and leaves the connection idle.
  // Records whether the server later ends it cleanly (FIN) or resets it (RST).
  const openIdleConnection = () =>
    new Promise(resolve => {
      const socket = net.connect(port, 'localhost');
      const state = { socket, ended: false, errors: [], closed: null };
      socket.on('end', () => (state.ended = true));
      socket.on('error', error => state.errors.push(error.code || error.message));
      state.closed = new Promise(res => socket.on('close', hadError => res(hadError)));
      socket.once('connect', () => {
        socket.write(
          `GET /1/health HTTP/1.1\r\nHost: localhost\r\nX-Parse-Application-Id: ${appId}\r\nConnection: keep-alive\r\n\r\n`
        );
      });
      socket.once('data', data => {
        expect(data.toString()).toMatch(/^HTTP\/1\.1 200/);
        resolve(state);
      });
    });

  afterEach(async () => {
    triggers.removeFunction('slow', appId);
    const current = server;
    server = undefined;
    let shutdownError;
    try {
      await current?.handleShutdown();
    } catch (error) {
      shutdownError = error;
    }
    // Restore the shared test server even if the shutdown failed, so that the failure does not
    // cascade into the following specs; report both errors if the restoration fails as well
    try {
      await reconfigureServer();
    } catch (error) {
      throw shutdownError
        ? new AggregateError([shutdownError, error], 'Shutdown and restoration failed')
        : error;
    }
    if (shutdownError) {
      throw shutdownError;
    }
  });

  it('transitions through initialized, starting, ok, draining and closed without resetting connections', async () => {
    const events = [];
    const mark = name => events.push({ name, at: Date.now() });
    const config = makeConfig({
      shutdownDrainDelay: 1000,
      shutdownTimeout: 2000,
      serverCloseComplete: () => mark('serverCloseComplete'),
    });

    // Parse Server mounted into an Express app that owns the HTTP server
    const api = new ParseServer(config);
    const app = express();
    app.use('/1', api.app);
    api.server = await new Promise(resolve => {
      const httpServer = app.listen(port, () => resolve(httpServer));
    });
    server = api;
    // The in-flight requests stay in flight until the server has stopped accepting connections, so
    // that they are completed by the shutdown timeout phase and not already by the drain phase
    triggers.addFunction(
      'slow',
      async () => {
        while (api.server.listening) {
          await sleep(20);
        }
        return 'done';
      },
      null,
      appId
    );
    const databaseAdapter = api.config.databaseController.adapter;
    const originalDatabaseShutdown = databaseAdapter.handleShutdown;
    spyOn(databaseAdapter, 'handleShutdown').and.callFake(function () {
      mark('databaseAdapter.handleShutdown');
      return originalDatabaseShutdown.apply(this, arguments);
    });
    // Initialization is held back until released so that the starting state can be observed
    let releaseInitialization;
    const initializationGate = new Promise(resolve => (releaseInitialization = resolve));
    const databaseController = api.config.databaseController;
    const originalInitialization = databaseController.performInitialization;
    spyOn(databaseController, 'performInitialization').and.callFake(async function () {
      await initializationGate;
      return originalInitialization.apply(this, arguments);
    });

    // 1. Constructed but not started: health reports the state, API requests are rejected
    let response = await health();
    expect(response.status).toBe(503);
    expect(response.data.status).toBe('initialized');
    response = await createObject();
    expect(response.status).toBe(500);
    expect(response.data.error).toBe('Invalid server state: initialized');

    // 2. Starting: health asks the client to retry
    const starting = api.start();
    try {
      response = await health();
      expect(response.status).toBe(503);
      expect(response.data.status).toBe('starting');
      expect(response.headers['retry-after']).toBe('1');
    } finally {
      // Always released, otherwise a failed probe would block the start and the cleanup
      releaseInitialization();
    }
    await starting;

    // 3. Ready: health is ok and requests are served
    response = await health();
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('ok');
    expect(response.headers['retry-after']).toBeUndefined();
    response = await createObject();
    expect(response.status).toBe(201);
    expect(response.data.objectId).toBeDefined();

    // 4. Open connections that must survive the shutdown: idle keep-alive connections and in-flight requests
    const idleConnections = await Promise.all([openIdleConnection(), openIdleConnection(), openIdleConnection()]);
    const inFlight = [callSlowFunction(), callSlowFunction()];
    await sleep(50);

    // 5. Draining: health fails so that load balancers stop routing here, but requests are still served
    const shutdown = api.handleShutdown();
    response = await health();
    expect(response.status).toBe(503);
    expect(response.data.status).toBe('draining');
    expect(response.headers['retry-after']).toBeUndefined();
    response = await createObject();
    expect(response.status).toBe(201);

    // 6. In-flight requests complete and idle connections are ended with FIN, not reset
    const results = await Promise.all(inFlight);
    mark('inFlightCompleted');
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.data.result).toBe('done');
    }
    await shutdown;
    for (const connection of idleConnections) {
      expect(await connection.closed).toBe(false, 'idle connection was closed with an error');
      expect(connection.ended).toBe(true, 'idle connection did not receive FIN');
      expect(connection.errors).toEqual([]);
    }

    // 7. Adapters are shut down only after the in-flight requests completed, completion callback runs last
    const at = name => events.find(e => e.name === name)?.at;
    expect(at('databaseAdapter.handleShutdown')).toBeGreaterThanOrEqual(at('inFlightCompleted'));
    expect(at('serverCloseComplete')).toBeGreaterThanOrEqual(at('databaseAdapter.handleShutdown'));
    expect(events.filter(e => e.name === 'serverCloseComplete').length).toBe(1);

    // 8. Closed: nothing listens anymore, repeated shutdown is a no-op
    response = await health();
    expect(response.status).toBeUndefined();
    expect(response.code).toBe('ECONNREFUSED');
    expect(api.handleShutdown()).toBe(shutdown);
    await api.handleShutdown();
    expect(events.filter(e => e.name === 'serverCloseComplete').length).toBe(1);
    expect(api.config.state).toBe('closed');
  });

  it('closes LiveQuery clients during the drain instead of waiting for the shutdown timeout', async () => {
    const liveQueryPort = port + 1;
    server = await ParseServer.startApp(
      makeConfig({
        liveQuery: { classNames: ['LifecycleTest'] },
        startLiveQueryServer: true,
        liveQueryServerOptions: { port: liveQueryPort },
        shutdownTimeout: 5000,
      })
    );
    // A dedicated client, the shared default client must stay connected to the test server
    const client = new Parse.LiveQueryClient({
      applicationId: appId,
      serverURL: `ws://localhost:${liveQueryPort}/1`,
      javascriptKey: defaultConfiguration.javascriptKey,
    });
    client.open();
    const subscription = client.subscribe(new Parse.Query('LifecycleTest'));
    await new Promise(resolve => subscription.on('open', resolve));
    const closed = new Promise(resolve => subscription.on('close', resolve));
    const started = Date.now();
    await server.handleShutdown();
    await closed;
    // The open WebSocket must not keep the servers open for the whole timeout
    expect(Date.now() - started).toBeLessThan(2500);
    client.close();
  });

  it('does not wait for an unresponsive LiveQuery shutdown before shutting down the adapters', async () => {
    let closeCompleteCalls = 0;
    server = await ParseServer.startApp(
      makeConfig({
        liveQuery: { classNames: ['LifecycleTest'] },
        startLiveQueryServer: true,
        serverCloseComplete: () => (closeCompleteCalls += 1),
      })
    );
    // The pub/sub adapter never settles, as with an unreachable Redis server
    spyOn(server.liveQueryServer, 'shutdown').and.returnValue(new Promise(() => {}));
    spyOn(console, 'error').and.callFake(() => {});
    const started = Date.now();
    let error;
    await server.handleShutdown().catch(e => (error = e));
    expect(Date.now() - started).toBeLessThan(2500);
    expect(error.errors.map(e => e.message)).toEqual([
      'The LiveQuery server did not shut down in time',
    ]);
    // The remaining steps ran regardless
    expect(server.config.state).toBe('closed');
    expect(closeCompleteCalls).toBe(1);
    expect((await health()).code).toBe('ECONNREFUSED');
    server = undefined;
  });

  it('runs every shutdown step and rejects with the collected errors', async () => {
    let closeCompleteCalls = 0;
    server = await ParseServer.startApp(
      makeConfig({ serverCloseComplete: () => (closeCompleteCalls += 1) })
    );
    const databaseAdapter = server.config.databaseController.adapter;
    const originalDatabaseShutdown = databaseAdapter.handleShutdown;
    spyOn(databaseAdapter, 'handleShutdown').and.callFake(async function () {
      await originalDatabaseShutdown.apply(this, arguments);
      throw new Error('database adapter shutdown failed');
    });
    spyOn(console, 'error').and.callFake(() => {});

    await expectAsync(server.handleShutdown()).toBeRejectedWithError(
      /Parse Server shutdown completed with errors/
    );
    let error;
    await server.handleShutdown().catch(e => (error = e));
    expect(error.errors.map(e => e.message)).toEqual(['database adapter shutdown failed']);
    // The remaining steps ran regardless of the failure
    expect(server.config.state).toBe('closed');
    expect(closeCompleteCalls).toBe(1);
    expect((await health()).code).toBe('ECONNREFUSED');
    // Already shut down; afterEach must not await the rejected promise again
    server = undefined;
  });

  it('warns when there is no HTTP server to close', async () => {
    const api = new ParseServer(makeConfig());
    server = api;
    await api.start();
    const logger = require('../lib/logger').logger;
    spyOn(logger, 'warn').and.callFake(() => {});
    await api.handleShutdown();
    expect(logger.warn).toHaveBeenCalledWith(jasmine.stringMatching(/no HTTP server to close/));
    expect(api.config.state).toBe('closed');
  });

  it('does not drain or serve requests on shutdown when the server never became ready', async () => {
    const api = new ParseServer(makeConfig({ shutdownDrainDelay: 1000 }));
    server = api;
    const app = express();
    app.use('/1', api.app);
    api.server = await new Promise(resolve => {
      const httpServer = app.listen(port, () => resolve(httpServer));
    });
    expect((await createObject()).status).toBe(500);
    const started = Date.now();
    await api.handleShutdown();
    // No drain phase: the server was never serving, so there is nothing to drain
    expect(Date.now() - started).toBeLessThan(1000);
    expect(api.config.state).toBe('closed');
    expect((await health()).code).toBe('ECONNREFUSED');
  });

  it('rejects invalid shutdown options', () => {
    expect(() => new ParseServer(makeConfig({ shutdownTimeout: null }))).not.toThrow();
    for (const value of ['5s', -1, 1.5, Infinity, 2147483648]) {
      expect(() => new ParseServer(makeConfig({ shutdownTimeout: value }))).toThrow(
        'shutdownTimeout must be an integer between 0 and 2147483647 (milliseconds).'
      );
      expect(() => new ParseServer(makeConfig({ shutdownDrainDelay: value }))).toThrow(
        'shutdownDrainDelay must be an integer between 0 and 2147483647 (milliseconds).'
      );
    }
  });

  it('waits for a start in progress before shutting down', async () => {
    server = new ParseServer(makeConfig());
    const starting = server.startApp(makeConfig());
    const shutdown = server.handleShutdown();
    await expectAsync(starting).toBeResolved();
    await shutdown;
    expect(server.config.state).toBe('closed');
    expect((await health()).code).toBe('ECONNREFUSED');
  });

  it('cannot be started again once shutdown has been requested', async () => {
    const api = new ParseServer(makeConfig());
    server = api;
    await api.start();
    const shutdown = api.handleShutdown();
    await expectAsync(api.start()).toBeRejectedWithError(/cannot be started after handleShutdown/);
    await shutdown;
    await expectAsync(api.start()).toBeRejectedWithError(/cannot be started after handleShutdown/);
    await expectAsync(api.startApp(makeConfig())).toBeRejectedWithError(
      /cannot be started after handleShutdown/
    );
  });

  it('waits for every startup operation to settle before failing to start', async () => {
    const { InMemoryCacheAdapter } = require('../lib/Adapters/Cache/InMemoryCacheAdapter');
    const cacheAdapter = new InMemoryCacheAdapter({ ttl: 5000, maxSize: 100 });
    let cacheSettled = false;
    cacheAdapter.connect = async () => {
      await sleep(300);
      cacheSettled = true;
      throw new Error('cache unavailable');
    };
    const api = new ParseServer(makeConfig({ cacheAdapter }));
    server = api;
    spyOn(api.config.liveQueryController, 'connect').and.rejectWith(
      new Error('LiveQuery unavailable')
    );
    spyOn(console, 'error').and.callFake(() => {});
    // The first failure is reported, but only once the cache adapter connection has settled as well
    await expectAsync(api.start()).toBeRejectedWithError('LiveQuery unavailable');
    expect(cacheSettled).toBe(true);
    expect(api.config.state).toBe('error');
  });

  it('destroys in-flight connections once the shutdown timeout expires', async () => {
    server = await ParseServer.startApp(makeConfig({ shutdownTimeout: 200 }));
    let handlerStarted;
    const handlerRunning = new Promise(resolve => (handlerStarted = resolve));
    triggers.addFunction(
      'slow',
      async () => {
        handlerStarted();
        await sleep(2000);
        return 'done';
      },
      null,
      appId
    );
    const inFlight = callSlowFunction();
    await handlerRunning;

    const started = Date.now();
    const shutdown = server.handleShutdown();
    // The connection is not reset before the timeout expires
    const early = await Promise.race([
      inFlight.then(() => 'settled'),
      sleep(150).then(() => 'pending'),
    ]);
    expect(early).toBe('pending');
    await shutdown;
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(elapsed).toBeLessThan(1500);

    const error = await inFlight;
    expect(error.status).toBeUndefined();
    expect(error.code).toBe('ECONNRESET');
  });
});
