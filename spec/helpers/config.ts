// Default test-server connection details, mirroring spec/helper.js
// defaultConfiguration. Single source of truth for the REST test client so
// specs never inline URLs or keys.
export const TestConfig = {
  serverURL: 'http://localhost:8378/1',
  appId: 'test',
  masterKey: 'test',
  restAPIKey: 'rest',
  clientKey: 'client',
  javascriptKey: 'test',
} as const;
