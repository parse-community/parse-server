import { z } from 'zod';
import { option } from '../schemaUtils';

export const LiveQueryOptionsSchema = z
  .object({
    classNames: option(z.array(z.string()).optional(), {
      env: 'PARSE_SERVER_LIVEQUERY_CLASSNAMES',
      help: 'Parse class names for which the LiveQuery server will publish events. Only listed classes will emit LiveQuery events server-side.',
    }),
    pubSubAdapter: option(z.any().optional(), {
      env: 'PARSE_SERVER_LIVEQUERY_PUB_SUB_ADAPTER',
      help: 'Adapter module for pub/sub messaging between the API server and LiveQuery server.',
    }),
    redisOptions: option(z.record(z.string(), z.any()).optional(), {
      env: 'PARSE_SERVER_LIVEQUERY_REDIS_OPTIONS',
      help: 'Redis client configuration options for the LiveQuery pub/sub connection.',
    }),
    redisURL: option(z.string().optional(), {
      env: 'PARSE_SERVER_LIVEQUERY_REDIS_URL',
      help: 'Redis connection URL used for LiveQuery pub/sub messaging.',
    }),
    regexTimeout: option(z.number().default(100), {
      env: 'PARSE_SERVER_LIVEQUERY_REGEX_TIMEOUT',
      help: 'Maximum time in milliseconds allowed for regex evaluation in LiveQuery subscription matching.',
    }),
    wssAdapter: option(z.any().optional(), {
      env: 'PARSE_SERVER_LIVEQUERY_WSS_ADAPTER',
      help: 'Custom WebSocket server adapter for the LiveQuery server.',
    }),
  })
  .loose();

export type LiveQueryOptions = z.infer<typeof LiveQueryOptionsSchema>;

export const LiveQueryServerOptionsSchema = z
  .object({
    appId: option(z.string().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_APP_ID',
      help: 'The Parse application ID the LiveQuery server authenticates against.',
    }),
    cacheTimeout: option(z.number().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_CACHE_TIMEOUT',
      help: 'Duration in milliseconds before cached subscription data expires.',
    }),
    keyPairs: option(z.record(z.string(), z.any()).optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_KEY_PAIRS',
      help: 'Key-value pairs for authenticating client connections to the LiveQuery server.',
    }),
    logLevel: option(z.string().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_LOG_LEVEL',
      help: 'Log verbosity level for the LiveQuery server.',
    }),
    masterKey: option(z.string().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_MASTER_KEY',
      help: 'The master key for the Parse app this LiveQuery server connects to.',
    }),
    port: option(z.number().default(1337), {
      env: 'PARSE_LIVE_QUERY_SERVER_PORT',
      help: 'The port number the LiveQuery WebSocket server listens on.',
    }),
    pubSubAdapter: option(z.any().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_PUB_SUB_ADAPTER',
      help: 'Adapter module for pub/sub messaging in the standalone LiveQuery server.',
    }),
    redisOptions: option(z.record(z.string(), z.any()).optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_REDIS_OPTIONS',
      help: 'Redis client configuration options for the standalone LiveQuery server.',
    }),
    redisURL: option(z.string().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_REDIS_URL',
      help: 'Redis connection URL for the standalone LiveQuery server.',
    }),
    serverURL: option(z.string().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_SERVER_URL',
      help: 'The Parse Server URL that the standalone LiveQuery server connects to for query matching.',
    }),
    websocketTimeout: option(z.number().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_WEBSOCKET_TIMEOUT',
      help: 'Duration in milliseconds before an idle WebSocket connection is closed.',
    }),
    wssAdapter: option(z.any().optional(), {
      env: 'PARSE_LIVE_QUERY_SERVER_WSS_ADAPTER',
      help: 'Custom WebSocket server adapter for the standalone LiveQuery server.',
    }),
  })
  .loose();

export type LiveQueryServerOptions = z.infer<typeof LiveQueryServerOptionsSchema>;
