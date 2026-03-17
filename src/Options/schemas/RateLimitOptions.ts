import { z } from 'zod';
import { option } from '../schemaUtils';

export const RateLimitOptionsSchema = z
  .object({
    errorResponseMessage: option(z.string().default('Too many requests.'), {
      env: 'PARSE_SERVER_RATE_LIMIT_ERROR_RESPONSE_MESSAGE',
      help: 'Custom error message returned to the client when the rate limit is exceeded.',
    }),
    includeInternalRequests: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_RATE_LIMIT_INCLUDE_INTERNAL_REQUESTS',
      help: 'Apply rate limiting to internal server-to-server requests in addition to external client requests.',
    }),
    includeMasterKey: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_RATE_LIMIT_INCLUDE_MASTER_KEY',
      help: 'Apply rate limiting to requests authenticated with the master key.',
    }),
    redisUrl: option(z.string().optional(), {
      env: 'PARSE_SERVER_RATE_LIMIT_REDIS_URL',
      help: 'Redis connection URL for a shared rate limit store across multiple server instances.',
    }),
    requestCount: option(z.number().int().min(1).optional(), {
      env: 'PARSE_SERVER_RATE_LIMIT_REQUEST_COUNT',
      help: 'Maximum number of requests allowed within the time window before rate limiting kicks in.',
    }),
    requestMethods: option(z.union([z.array(z.string()), z.string()]).optional(), {
      env: 'PARSE_SERVER_RATE_LIMIT_REQUEST_METHODS',
      help: "HTTP methods to apply rate limiting to (e.g. ['GET', 'POST']). Defaults to all methods.",
    }),
    requestPath: option(z.string(), {
      env: 'PARSE_SERVER_RATE_LIMIT_REQUEST_PATH',
      help: "The API path pattern to apply rate limiting to (e.g. 'users', 'functions/.*').",
    }),
    requestTimeWindow: option(z.number().int().min(1).optional(), {
      env: 'PARSE_SERVER_RATE_LIMIT_REQUEST_TIME_WINDOW',
      help: 'Duration in milliseconds of the sliding time window for counting requests.',
    }),
    zone: option(z.enum(['ip', 'user', 'session', 'global']).default('ip'), {
      env: 'PARSE_SERVER_RATE_LIMIT_ZONE',
      help: "Rate limit zone identifier for grouping requests (e.g. 'ip', 'user', 'session', or 'global').",
    }),
  })
  .loose();

export type RateLimitOptions = z.infer<typeof RateLimitOptionsSchema>;
