module.exports = {
  testEnvironment: '<rootDir>/src/cli/detail/generated/detail.environment.ts',
  setupFilesAfterEnv: ['<rootDir>/src/cli/detail/generated/detail.setup.ts'],
  transform: {
    "^.+\\.jsx?$": "babel-jest",
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 20000, // 20 seconds
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage/detail',
  coverageReporters: ['lcov'],
  globalTeardown: '<rootDir>/test-teardown-globals.js',
};
