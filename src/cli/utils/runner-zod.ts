/* eslint-disable no-console */
import path from 'path';
import { Command } from 'commander';
import { z } from 'zod';
import { loadFromEnv } from '../../Options/loaders/envLoader';
import { loadFromFile } from '../../Options/loaders/fileLoader';
import { registerSchemaOptions, extractCliOptions } from '../../Options/loaders/cliLoader';
import { mergeConfigs } from '../../Options/loaders/mergeConfig';
import Deprecator from '../../Deprecator/Deprecator';
import { getAllOptionMeta } from '../../Options/schemaUtils';

function logStartupOptions(options: Record<string, any>) {
  if (!options.verbose) {
    return;
  }
  const keysToRedact = ['databaseAdapter', 'databaseURI', 'masterKey', 'maintenanceKey', 'push'];
  for (const key in options) {
    let value = options[key];
    if (keysToRedact.includes(key)) {
      value = '<REDACTED>';
    }
    if (typeof value === 'object') {
      try {
        value = JSON.stringify(value);
      } catch {
        if (value && value.constructor && value.constructor.name) {
          value = value.constructor.name;
        }
      }
    }
    console.log(`${key}: ${value}`);
  }
}

interface RunnerZodOptions {
  schema: z.ZodObject<z.ZodRawShape>;
  help?: () => void;
  usage?: string;
  start: (
    program: Command,
    options: Record<string, any>,
    logOptions: () => void
  ) => void;
}

/**
 * Zod-based CLI runner that replaces the old definitions-based runner.
 *
 * Uses Zod schemas for option registration, env var loading, config file
 * loading, and merge with proper priority order.
 *
 * Priority (lowest to highest):
 * 1. Schema defaults (applied by Zod during parse)
 * 2. Config file
 * 3. Environment variables
 * 4. CLI arguments
 */
export default function runnerZod({ schema, help, usage, start }: RunnerZodOptions) {
  const program = new Command();
  program.allowExcessArguments();

  // Register options from Zod schema metadata
  registerSchemaOptions(program, schema);

  if (usage) {
    program.usage(usage);
  }
  if (help) {
    program.on('--help', help);
  }

  // Add environment variable help
  const allMeta = getAllOptionMeta(schema);
  program.on('--help', () => {
    console.log('  Configure From Environment:');
    console.log('');
    for (const [key, meta] of allMeta) {
      if (meta.env) {
        console.log(`    $ ${meta.env}='${key}'`);
      }
    }
    console.log('');
  });

  // Parse CLI args
  program.parse(process.argv);

  // Extract only explicitly-set CLI options (not defaults from Commander)
  const cliOptions = extractCliOptions(program, schema);

  // Load from config file (first positional arg)
  let fileOptions: Record<string, any> = {};
  if (program.args.length > 0) {
    try {
      fileOptions = loadFromFile(program.args[0]);
      console.log(`Configuration loaded from ${path.resolve(program.args[0])}`);
    } catch (e: any) {
      console.error(`Error loading config file: ${e.message}`);
      process.exit(1);
    }
  }

  // Load from environment variables
  const envOptions = loadFromEnv(schema, process.env);

  // Merge: file < env < CLI (CLI wins)
  const merged = mergeConfigs(fileOptions, envOptions, cliOptions);

  // Scan for deprecated options
  Deprecator.scanParseServerOptions(merged);

  // Parse through Zod to apply defaults and validate types
  const result = schema.safeParse(merged);
  if (!result.success) {
    const messages = result.error.issues.map(issue => {
      const path = issue.path.join('.');
      return path ? `  ${path}: ${issue.message}` : `  ${issue.message}`;
    });
    console.error('Configuration errors:');
    console.error(messages.join('\n'));
    process.exit(1);
  }

  const options = result.data as Record<string, any>;

  start(program, options, function () {
    logStartupOptions(options);
  });
}
/* eslint-enable no-console */
