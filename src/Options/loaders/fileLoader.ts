import path from 'path';

/**
 * Loads configuration from a JSON or JS config file.
 *
 * Supports two formats:
 * 1. Direct config object: `{ appId: "...", masterKey: "..." }`
 * 2. PM2/multi-app format: `{ apps: [{ appId: "...", masterKey: "..." }] }`
 *    (only single app is supported)
 *
 * @param filePath - Path to the JSON or JS config file
 * @returns The parsed configuration object
 */
export function loadFromFile(filePath: string): Record<string, unknown> {
  const resolvedPath = path.resolve(filePath);
  const jsonConfig = require(resolvedPath);

  let options: Record<string, unknown>;

  if (jsonConfig.apps) {
    if (jsonConfig.apps.length > 1) {
      throw new Error('Multiple apps are not supported');
    }
    options = jsonConfig.apps[0];
  } else {
    options = jsonConfig;
  }

  return options;
}
