import { z } from 'zod';
import { option } from '../schemaUtils';

export const SecurityOptionsSchema = z
  .object({
    checkGroups: option(z.array(z.any()).optional(), {
      env: 'PARSE_SERVER_SECURITY_CHECK_GROUPS',
      help: 'Array of security check group classes to run during a security audit.',
    }),
    enableCheck: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_SECURITY_ENABLE_CHECK',
      help: 'Enable the Parse Server security check that audits configuration for vulnerabilities.',
    }),
    enableCheckLog: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_SECURITY_ENABLE_CHECK_LOG',
      help: 'Log the results of security checks to the server console on startup.',
    }),
  })
  .loose();

export type SecurityOptions = z.infer<typeof SecurityOptionsSchema>;
