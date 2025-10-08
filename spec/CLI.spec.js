'use strict';
let commander;
const definitions = require('../lib/cli/definitions/parse-server').default;
const liveQueryDefinitions = require('../lib/cli/definitions/parse-live-query-server').default;
const path = require('path');
const { spawn } = require('child_process');

const testDefinitions = {
  arg0: 'PROGRAM_ARG_0',
  arg1: {
    env: 'PROGRAM_ARG_1',
    required: true,
  },
  arg2: {
    env: 'PROGRAM_ARG_2',
    action: function (value) {
      const intValue = parseInt(value);
      if (!Number.isInteger(intValue)) {
        throw 'arg2 is invalid';
      }
      return intValue;
    },
  },
  arg3: {},
  arg4: {
    default: 'arg4Value',
  },
};

describe('commander additions', () => {
  beforeEach(() => {
    const command = require('../lib/cli/utils/commander').default;
    commander = new command.constructor();
    commander.storeOptionsAsProperties();
    commander.allowExcessArguments();
  });
  afterEach(done => {
    commander.options = [];
    delete commander.arg0;
    delete commander.arg1;
    delete commander.arg2;
    delete commander.arg3;
    delete commander.arg4;
    done();
  });

  it('should load properly definitions from args', done => {
    commander.loadDefinitions(testDefinitions);
    commander.parse([
      'node',
      './CLI.spec.js',
      '--arg0',
      'arg0Value',
      '--arg1',
      'arg1Value',
      '--arg2',
      '2',
      '--arg3',
      'some',
    ]);
    expect(commander.arg0).toEqual('arg0Value');
    expect(commander.arg1).toEqual('arg1Value');
    expect(commander.arg2).toEqual(2);
    expect(commander.arg3).toEqual('some');
    expect(commander.arg4).toEqual('arg4Value');
    done();
  });

  it('should load properly definitions from env', done => {
    commander.loadDefinitions(testDefinitions);
    commander.parse([], {
      PROGRAM_ARG_0: 'arg0ENVValue',
      PROGRAM_ARG_1: 'arg1ENVValue',
      PROGRAM_ARG_2: '3',
    });
    expect(commander.arg0).toEqual('arg0ENVValue');
    expect(commander.arg1).toEqual('arg1ENVValue');
    expect(commander.arg2).toEqual(3);
    expect(commander.arg4).toEqual('arg4Value');
    done();
  });

  it('should load properly use args over env', () => {
    commander.loadDefinitions(testDefinitions);
    commander.parse(['node', './CLI.spec.js', '--arg0', 'arg0Value', '--arg4', ''], {
      PROGRAM_ARG_0: 'arg0ENVValue',
      PROGRAM_ARG_1: 'arg1ENVValue',
      PROGRAM_ARG_2: '4',
      PROGRAM_ARG_4: 'arg4ENVValue',
    });
    expect(commander.arg0).toEqual('arg0Value');
    expect(commander.arg1).toEqual('arg1ENVValue');
    expect(commander.arg2).toEqual(4);
    expect(commander.arg4).toEqual('');
  });

  it('should fail in action as port is invalid', done => {
    commander.loadDefinitions(testDefinitions);
    expect(() => {
      commander.parse(['node', './CLI.spec.js', '--arg0', 'arg0Value'], {
        PROGRAM_ARG_0: 'arg0ENVValue',
        PROGRAM_ARG_1: 'arg1ENVValue',
        PROGRAM_ARG_2: 'hello',
      });
    }).toThrow('arg2 is invalid');
    done();
  });

  it('should not override config.json', done => {
    spyOn(console, 'log').and.callFake(() => {});
    commander.loadDefinitions(testDefinitions);
    commander.parse(
      ['node', './CLI.spec.js', '--arg0', 'arg0Value', './spec/configs/CLIConfig.json'],
      {
        PROGRAM_ARG_0: 'arg0ENVValue',
        PROGRAM_ARG_1: 'arg1ENVValue',
      }
    );
    const options = commander.getOptions();
    expect(options.arg2).toBe(8888);
    expect(options.arg3).toBe('hello'); //config value
    expect(options.arg4).toBe('/1');
    done();
  });

  it('should fail with invalid values in JSON', done => {
    commander.loadDefinitions(testDefinitions);
    expect(() => {
      commander.parse(
        ['node', './CLI.spec.js', '--arg0', 'arg0Value', './spec/configs/CLIConfigFail.json'],
        {
          PROGRAM_ARG_0: 'arg0ENVValue',
          PROGRAM_ARG_1: 'arg1ENVValue',
        }
      );
    }).toThrow('arg2 is invalid');
    done();
  });

  it('should fail when too many apps are set', done => {
    commander.loadDefinitions(testDefinitions);
    expect(() => {
      commander.parse(['node', './CLI.spec.js', './spec/configs/CLIConfigFailTooManyApps.json']);
    }).toThrow('Multiple apps are not supported');
    done();
  });

  it('should load config from apps', done => {
    spyOn(console, 'log').and.callFake(() => {});
    commander.loadDefinitions(testDefinitions);
    commander.parse(['node', './CLI.spec.js', './spec/configs/CLIConfigApps.json']);
    const options = commander.getOptions();
    expect(options.arg1).toBe('my_app');
    expect(options.arg2).toBe(8888);
    expect(options.arg3).toBe('hello'); //config value
    expect(options.arg4).toBe('/1');
    done();
  });

  it('should fail when passing an invalid arguement', done => {
    commander.loadDefinitions(testDefinitions);
    expect(() => {
      commander.parse(['node', './CLI.spec.js', './spec/configs/CLIConfigUnknownArg.json']);
    }).toThrow('error: unknown option myArg');
    done();
  });
});

describe('definitions', () => {
  it('should have valid types', () => {
    for (const key in definitions) {
      const definition = definitions[key];
      expect(typeof definition).toBe('object');
      if (typeof definition.env !== 'undefined') {
        expect(typeof definition.env).toBe('string');
      }
      expect(typeof definition.help).toBe('string');
      if (typeof definition.required !== 'undefined') {
        expect(typeof definition.required).toBe('boolean');
      }
      if (typeof definition.action !== 'undefined') {
        expect(typeof definition.action).toBe('function');
      }
    }
  });

  it('should throw when using deprecated facebookAppIds', () => {
    expect(() => {
      definitions.facebookAppIds.action();
    }).toThrow();
  });
});

describe('LiveQuery definitions', () => {
  it('should have valid types', () => {
    for (const key in liveQueryDefinitions) {
      const definition = liveQueryDefinitions[key];
      expect(typeof definition).toBe('object');
      if (typeof definition.env !== 'undefined') {
        expect(typeof definition.env).toBe('string');
      }
      expect(typeof definition.help).toBe('string', `help for ${key} should be a string`);
      if (typeof definition.required !== 'undefined') {
        expect(typeof definition.required).toBe('boolean');
      }
      if (typeof definition.action !== 'undefined') {
        expect(typeof definition.action).toBe('function');
      }
    }
  });
});

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
