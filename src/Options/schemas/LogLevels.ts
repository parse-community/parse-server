import { z } from 'zod';
import { option } from '../schemaUtils';

export const LogLevelsSchema = z
  .object({
    cloudFunctionError: option(z.string().default('error'), {
      env: 'PARSE_SERVER_LOG_LEVELS_CLOUD_FUNCTION_ERROR',
      help: 'Log level used when a cloud function throws an error.',
    }),
    cloudFunctionSuccess: option(z.string().default('info'), {
      env: 'PARSE_SERVER_LOG_LEVELS_CLOUD_FUNCTION_SUCCESS',
      help: 'Log level used when a cloud function completes successfully.',
    }),
    signupUsernameTaken: option(z.string().default('info'), {
      env: 'PARSE_SERVER_LOG_LEVELS_SIGNUP_USERNAME_TAKEN',
      help: 'Log level used when a signup attempt fails because the username is already taken.',
    }),
    triggerAfter: option(z.string().default('info'), {
      env: 'PARSE_SERVER_LOG_LEVELS_TRIGGER_AFTER',
      help: "Log level used for afterSave, afterDelete, and other 'after' trigger executions.",
    }),
    triggerBeforeError: option(z.string().default('error'), {
      env: 'PARSE_SERVER_LOG_LEVELS_TRIGGER_BEFORE_ERROR',
      help: 'Log level used when a beforeSave or beforeDelete trigger throws an error.',
    }),
    triggerBeforeSuccess: option(z.string().default('info'), {
      env: 'PARSE_SERVER_LOG_LEVELS_TRIGGER_BEFORE_SUCCESS',
      help: 'Log level used when a beforeSave or beforeDelete trigger completes successfully.',
    }),
  })
  .loose();

export type LogLevels = z.infer<typeof LogLevelsSchema>;
