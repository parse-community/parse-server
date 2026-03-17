import { z } from 'zod';

/**
 * Metadata attached to each Zod schema field describing its config behavior.
 */
export interface OptionMeta {
  /** Environment variable name (e.g. 'PARSE_SERVER_APPLICATION_ID'). Null means not settable via env. */
  env?: string | null;
  /** Help text for CLI and documentation. */
  help: string;
  /** Deprecation info if this option is deprecated. */
  deprecated?: DeprecationInfo;
  /** Which startup methods this option applies to. */
  applicableTo?: Array<'cli' | 'api'>;
  /** Whether this option accepts a dynamic (function) value with TTL caching. */
  dynamic?: boolean;
}

export interface DeprecationInfo {
  /** The option that replaces this one, if any. */
  replacement?: string;
  /** Message to display when the deprecated option is used. */
  message: string;
}

/**
 * Registry mapping Zod schemas to their option metadata.
 * Uses a WeakMap so schemas can be garbage collected.
 */
const metaRegistry = new WeakMap<z.ZodTypeAny, OptionMeta>();

/**
 * Wraps a Zod schema with option metadata (env var name, help text, etc.).
 * The metadata is stored in a WeakMap and can be retrieved with `getOptionMeta()`.
 *
 * Usage:
 * ```ts
 * const schema = z.object({
 *   appId: option(z.string(), {
 *     env: 'PARSE_SERVER_APPLICATION_ID',
 *     help: 'Your Parse Application ID',
 *   }),
 * });
 * ```
 */
export function option<T extends z.ZodTypeAny>(schema: T, meta: OptionMeta): T {
  metaRegistry.set(schema, meta);
  return schema;
}

/**
 * Retrieves the option metadata for a Zod schema field.
 * Returns undefined if no metadata was attached.
 */
export function getOptionMeta(schema: z.ZodTypeAny): OptionMeta | undefined {
  return metaRegistry.get(schema);
}

/**
 * Extracts all option metadata from a Zod object schema.
 * Returns a map of field name -> OptionMeta.
 */
export function getAllOptionMeta(
  schema: z.ZodObject<z.ZodRawShape>
): Map<string, OptionMeta> {
  const result = new Map<string, OptionMeta>();
  const shape = schema.shape;
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const meta = getOptionMeta(fieldSchema as z.ZodTypeAny);
    if (meta) {
      result.set(key, meta);
    }
  }
  return result;
}

/**
 * Builds a reverse map from environment variable names to option paths.
 * Supports nested schemas by recursing into fields whose Zod type is a ZodObject.
 */
export function buildEnvMap(
  schema: z.ZodObject<z.ZodRawShape>,
  parentPath: string[] = []
): Map<string, { path: string[]; fieldSchema: z.ZodTypeAny }> {
  const envMap = new Map<string, { path: string[]; fieldSchema: z.ZodTypeAny }>();
  const shape = schema.shape;

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const zodField = fieldSchema as z.ZodTypeAny;
    const meta = getOptionMeta(zodField);
    const currentPath = [...parentPath, key];

    if (meta?.env) {
      envMap.set(meta.env, { path: currentPath, fieldSchema: zodField });
    }

    // Recurse into nested ZodObject schemas
    const innerSchema = unwrapToObject(zodField);
    if (innerSchema) {
      const nestedMap = buildEnvMap(innerSchema, currentPath);
      for (const [envKey, value] of nestedMap) {
        envMap.set(envKey, value);
      }
    }
  }

  return envMap;
}

/**
 * Unwraps optional/default/nullable wrappers to find an inner ZodObject, if any.
 */
function unwrapToObject(schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape> | null {
  if (schema instanceof z.ZodObject) {
    return schema;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapToObject(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return unwrapToObject(schema.removeDefault() as z.ZodTypeAny);
  }
  return null;
}

/**
 * Coerces a string value (from env var or CLI) to the appropriate type
 * based on the Zod schema field type.
 */
export function coerceValue(value: string, fieldSchema: z.ZodTypeAny): unknown {
  const innerType = unwrapType(fieldSchema);

  if (innerType instanceof z.ZodNumber) {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Expected a number, got "${value}"`);
    }
    return num;
  }

  if (innerType instanceof z.ZodBoolean) {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new Error(`Expected a boolean ('true', 'false', '1', '0'), got "${value}"`);
  }

  if (innerType instanceof z.ZodArray) {
    if (typeof value === 'string') {
      // Try JSON array first, fall back to CSV
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Not JSON, treat as CSV
      }
      return value.split(',');
    }
    return value;
  }

  if (innerType instanceof z.ZodObject || innerType instanceof z.ZodRecord) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        throw new Error(`Expected valid JSON for object value, got "${value}"`);
      }
    }
    return value;
  }

  if (innerType instanceof z.ZodUnion) {
    // For union types, try each branch
    const options = (innerType as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>)._def.options;
    for (const opt of options) {
      const inner = unwrapType(opt);
      // Skip function types for string coercion
      if (inner instanceof z.ZodFunction) continue;
      try {
        return coerceValue(value, opt);
      } catch {
        continue;
      }
    }
    // If nothing else matched, return as string
    return value;
  }

  // Default: return as string
  return value;
}

/**
 * Unwraps optional/default/nullable wrappers to find the inner type.
 */
function unwrapType(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapType(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return unwrapType(schema.removeDefault() as z.ZodTypeAny);
  }
  return schema;
}

// --- Default Extraction ---

/**
 * Gets the default value from a Zod schema field, if any.
 * Handles Zod v3 (typeName) and v4 (type) internal representations.
 * Unwraps optional/nullable wrappers.
 */
export function getSchemaDefault(schema: z.ZodTypeAny): unknown {
  if (!schema || !(schema as any)._def) return undefined;
  const def = (schema as any)._def;
  const type = def.type || def.typeName;
  if (type === 'default' || type === 'ZodDefault') {
    const val = def.defaultValue;
    return typeof val === 'function' ? val() : val;
  }
  if (type === 'optional' || type === 'nullable' || type === 'ZodOptional' || type === 'ZodNullable') {
    return getSchemaDefault(def.innerType);
  }
  return undefined;
}

/**
 * Extracts all default values from a Zod object schema.
 * Returns a plain object with only the keys that have defaults.
 */
export function extractSchemaDefaults(
  schema: z.ZodObject<z.ZodRawShape>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    const def = getSchemaDefault(fieldSchema as z.ZodTypeAny);
    if (def !== undefined) {
      result[key] = def;
    }
  }
  return result;
}

/**
 * Converts a Zod object schema into a Definitions-compatible format.
 * Each key maps to `{ default: value }` if the field has a default.
 * Used by Config.js and middlewares.js for backwards compatibility.
 */
export function schemaToLegacyDefinitions(
  schema: z.ZodObject<z.ZodRawShape>
): Record<string, { default?: unknown }> {
  const result: Record<string, { default?: unknown }> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    const entry: { default?: unknown } = {};
    const def = getSchemaDefault(fieldSchema as z.ZodTypeAny);
    if (def !== undefined) {
      entry.default = def;
    }
    result[key] = entry;
  }
  return result;
}

// --- Phase 4: Advanced Features ---

/**
 * Returns a list of field names marked as dynamic in schema metadata.
 * Dynamic fields accept function values that are resolved at runtime with TTL caching.
 */
export function getDynamicKeys(schema: z.ZodObject<z.ZodRawShape>): string[] {
  const result: string[] = [];
  const allMeta = getAllOptionMeta(schema);
  for (const [key, meta] of allMeta) {
    if (meta.dynamic) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Option group definition for organizing options in documentation and CLI help.
 */
export interface OptionGroup {
  /** Display name for the group. */
  name: string;
  /** Description of the group. */
  description: string;
  /** Keys of options belonging to this group. */
  keys: string[];
}

/**
 * Returns the logical option groups for ParseServerOptions.
 * Groups organize the flat option namespace into categories for
 * documentation, CLI --help output, and option discovery (#7069).
 */
export function getOptionGroups(): OptionGroup[] {
  return [
    {
      name: 'Core',
      description: 'Essential server configuration',
      keys: [
        'appId', 'masterKey', 'masterKeyTtl', 'maintenanceKey', 'serverURL',
        'publicServerURL', 'port', 'host', 'mountPath', 'databaseURI',
        'cloud', 'verbose', 'silent', 'logLevel', 'logLevels', 'logsFolder',
        'jsonLogs', 'maxLogFiles',
      ],
    },
    {
      name: 'Keys',
      description: 'API keys for client and server access',
      keys: [
        'clientKey', 'javascriptKey', 'restAPIKey', 'dotNetKey', 'webhookKey',
        'fileKey', 'encryptionKey', 'readOnlyMasterKey',
      ],
    },
    {
      name: 'Security',
      description: 'Security and access control',
      keys: [
        'masterKeyIps', 'maintenanceKeyIps', 'readOnlyMasterKeyIps',
        'enforcePrivateUsers', 'security', 'requestKeywordDenylist',
        'enableInsecureAuthAdapters', 'allowExpiredAuthDataToken',
        'protectedFields', 'userSensitiveFields', 'trustProxy',
      ],
    },
    {
      name: 'Users & Auth',
      description: 'User authentication and email verification',
      keys: [
        'auth', 'enableAnonymousUsers', 'verifyUserEmails', 'sendUserEmailVerification',
        'preventLoginWithUnverifiedEmail', 'preventSignupWithUnverifiedEmail',
        'emailVerifyTokenValidityDuration', 'emailVerifyTokenReuseIfValid',
        'emailVerifySuccessOnInvalidEmail', 'accountLockout', 'passwordPolicy',
        'convertEmailToLowercase', 'convertUsernameToLowercase',
      ],
    },
    {
      name: 'Sessions',
      description: 'Session management',
      keys: [
        'sessionLength', 'expireInactiveSessions', 'extendSessionOnUse',
        'revokeSessionOnPasswordReset',
      ],
    },
    {
      name: 'Database',
      description: 'Database connection and options',
      keys: [
        'databaseAdapter', 'databaseOptions', 'collectionPrefix',
        'enableCollationCaseComparison', 'objectIdSize', 'allowCustomObjectId',
      ],
    },
    {
      name: 'Files',
      description: 'File storage and upload',
      keys: [
        'filesAdapter', 'fileUpload', 'maxUploadSize', 'preserveFileName',
      ],
    },
    {
      name: 'API Behavior',
      description: 'API features and limits',
      keys: [
        'defaultLimit', 'maxLimit', 'allowClientClassCreation', 'allowHeaders',
        'allowOrigin', 'directAccess', 'idempotencyOptions', 'rateLimit',
        'requestComplexity', 'enableSanitizedErrorResponse',
        'enableExpressErrorHandler', 'middleware', 'requestContextMiddleware',
      ],
    },
    {
      name: 'GraphQL',
      description: 'GraphQL configuration',
      keys: [
        'mountGraphQL', 'graphQLPath', 'graphQLSchema',
        'graphQLPublicIntrospection', 'mountPlayground', 'playgroundPath',
      ],
    },
    {
      name: 'LiveQuery',
      description: 'Real-time query subscriptions',
      keys: [
        'liveQuery', 'liveQueryServerOptions', 'startLiveQueryServer',
      ],
    },
    {
      name: 'Push & Email',
      description: 'Push notifications and email',
      keys: [
        'push', 'scheduledPush', 'emailAdapter',
      ],
    },
    {
      name: 'Pages',
      description: 'Custom pages for password reset and email verification',
      keys: [
        'pages', 'customPages',
      ],
    },
    {
      name: 'Adapters',
      description: 'Pluggable adapter modules',
      keys: [
        'analyticsAdapter', 'cacheAdapter', 'loggerAdapter',
        'cacheMaxSize', 'cacheTTL',
      ],
    },
    {
      name: 'Schema',
      description: 'Schema migration and management',
      keys: ['schema'],
    },
    {
      name: 'Server Lifecycle',
      description: 'Server startup and clustering',
      keys: [
        'cluster', 'serverCloseComplete', 'verifyServerUrl', 'appName',
        'enableProductPurchaseLegacyApi',
      ],
    },
  ];
}

/**
 * Validates that options marked with `applicableTo` are used in the
 * correct startup context. Logs a warning for options used outside
 * their applicable context.
 *
 * @param options - The parsed config object
 * @param context - The current startup context ('cli' or 'api')
 * @param schema - The Zod schema with option metadata
 * @param logger - Logger function for warnings (defaults to console.warn)
 */
export function warnInapplicableOptions(
  options: Record<string, any>,
  context: 'cli' | 'api',
  schema: z.ZodObject<z.ZodRawShape>,
  logger: (msg: string) => void = console.warn
): void {
  const allMeta = getAllOptionMeta(schema);
  for (const [key, meta] of allMeta) {
    if (
      meta.applicableTo &&
      !meta.applicableTo.includes(context) &&
      options[key] !== undefined
    ) {
      logger(
        `Warning: The option '${key}' is only applicable when using Parse Server via ` +
        `${meta.applicableTo.join(' or ')}. It has no effect in the current '${context}' context.`
      );
    }
  }
}
