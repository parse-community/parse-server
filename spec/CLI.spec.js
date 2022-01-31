'use strict';
const commander = require('../lib/cli/utils/commander').default;
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

  it('should load properly use args over env', done => {
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
    done();
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

  afterEach(done => {
    if (childProcess) {
      childProcess.on('close', () => {
        childProcess = undefined;
        done();
      });
      childProcess.kill();
    }
  });

  it('shoud start Parse Server', done => {
    childProcess = spawn(binPath, [
      '--appId',
      'test',
      '--masterKey',
      'test',
      '--databaseURI',
      'mongodb://localhost/test',
      '--port',
      '1339',
    ]);
    childProcess.stdout.on('data', data => {
      data = data.toString();
      if (data.includes('parse-server running on')) {
        done();
      }
    });
    childProcess.stderr.on('data', data => {
      done.fail(data.toString());
    });
  });

  it('shoud start Parse Server with GraphQL', done => {
    childProcess = spawn(binPath, [
      '--appId',
      'test',
      '--masterKey',
      'test',
      '--databaseURI',
      'mongodb://localhost/test',
      '--port',
      '1340',
      '--mountGraphQL',
    ]);
    let output = '';
    childProcess.stdout.on('data', data => {
      data = data.toString();
      output += data;
      if (data.includes('GraphQL running on')) {
        expect(output).toMatch('parse-server running on');
        done();
      }
    });
    childProcess.stderr.on('data', data => {
      done.fail(data.toString());
    });
  });

  it('shoud start Parse Server with GraphQL and Playground', done => {
    childProcess = spawn(binPath, [
      '--appId',
      'test',
      '--masterKey',
      'test',
      '--databaseURI',
      'mongodb://localhost/test',
      '--port',
      '1341',
      '--mountGraphQL',
      '--mountPlayground',
    ]);
    let output = '';
    childProcess.stdout.on('data', data => {
      data = data.toString();
      output += data;
      if (data.includes('Playground running on')) {
        expect(output).toMatch('GraphQL running on');
        expect(output).toMatch('parse-server running on');
        done();
      }
    });
    childProcess.stderr.on('data', data => {
      done.fail(data.toString());
    });
  });
});
