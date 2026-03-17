import { z } from 'zod';
import { option } from '../schemaUtils';

export const IdempotencyOptionsSchema = z
  .object({
    paths: option(z.array(z.string()).default([]), {
      env: 'PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_PATHS',
      help: "API request paths for which idempotency is enforced (e.g. 'functions/.*', 'classes/.*').",
    }),
    ttl: option(z.number().min(1, 'idempotency TTL value must be greater than 0 seconds').default(300), {
      env: 'PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_TTL',
      help: 'Duration in seconds that an idempotency key is cached to detect duplicate requests.',
    }),
  })
  .loose();

export type IdempotencyOptions = z.infer<typeof IdempotencyOptionsSchema>;
