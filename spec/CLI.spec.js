'use strict';
const path = require('path');
const { spawn } = require('child_process');

describe('execution', () => {
  const binPath = path.resolve(__dirname, '../bin/parse-server');
  let childProcess;
  let aggregatedData;

  function handleStdout(childProcess, done, aggregatedData, requiredData) {
    childProcess.stdout.on('data', data => {
      data = data.toString();
      aggregatedData.push(data);
      if (requiredData.every(required => aggregatedData.some(aggregated => aggregated.includes(required)))) {
        done();
      }
    });
  }

  function handleStderr(childProcess, done) {
    childProcess.stderr.on('data', data => {
      data = data.toString();
      if (!data.includes('[DEP0040] DeprecationWarning')) {
        done.fail(data);
      }
    });
  }

  function handleError(childProcess, done) {
    childProcess.on('error', err => {
      done.fail(err);
    });
  }

  beforeEach(() => {
    aggregatedData = [];
  });

  afterEach(done => {
    if (childProcess) {
      childProcess.on('close', () => {
        childProcess = undefined;
        done();
      });
      childProcess.kill();
    }
  });

  it_id('a0ab74b4-f805-4e03-b31d-b5cd59e64495')(it)('should start Parse Server', done => {
    const env = { ...process.env };
    env.NODE_OPTIONS = '--dns-result-order=ipv4first --trace-deprecation';
    childProcess = spawn(
      binPath,
      ['--appId', 'test', '--masterKey', 'test', '--databaseURI', databaseURI, '--port', '1339'],
      { env }
    );
    handleStdout(childProcess, done, aggregatedData, ['parse-server running on']);
    handleStderr(childProcess, done);
    handleError(childProcess, done);
  });

  it_id('d7165081-b133-4cba-901b-19128ce41301')(it)('should start Parse Server with GraphQL', async done => {
    const env = { ...process.env };
    env.NODE_OPTIONS = '--dns-result-order=ipv4first --trace-deprecation';
    childProcess = spawn(
      binPath,
      [
        '--appId',
        'test',
        '--masterKey',
        'test',
        '--databaseURI',
        databaseURI,
        '--port',
        '1340',
        '--mountGraphQL',
      ],
      { env }
    );
    handleStdout(childProcess, done, aggregatedData, [
      'parse-server running on',
      'GraphQL running on',
    ]);
    handleStderr(childProcess, done);
    handleError(childProcess, done);
  });

  it_id('2769cdb4-ce8a-484d-8a91-635b5894ba7e')(it)('should start Parse Server with GraphQL and Playground', async done => {
    const env = { ...process.env };
    env.NODE_OPTIONS = '--dns-result-order=ipv4first --trace-deprecation';
    childProcess = spawn(
      binPath,
      [
        '--appId',
        'test',
        '--masterKey',
        'test',
        '--databaseURI',
        databaseURI,
        '--port',
        '1341',
        '--mountGraphQL',
        '--mountPlayground',
      ],
      { env }
    );
    handleStdout(childProcess, done, aggregatedData, [
      'parse-server running on',
      'Playground running on',
      'GraphQL running on',
    ]);
    handleStderr(childProcess, done);
    handleError(childProcess, done);
  });

  it_id('23caddd7-bfea-4869-8bd4-0f2cd283c8bd')(it)('can start Parse Server with auth via CLI', done => {
    const env = { ...process.env };
    env.NODE_OPTIONS = '--dns-result-order=ipv4first --trace-deprecation';
    childProcess = spawn(
      binPath,
      ['--databaseURI', databaseURI, './spec/configs/CLIConfigAuth.json'],
      { env }
    );
    handleStdout(childProcess, done, aggregatedData, ['parse-server running on']);
    handleStderr(childProcess, done);
    handleError(childProcess, done);
  });
});
