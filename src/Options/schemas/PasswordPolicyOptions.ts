import { z } from 'zod';
import { option } from '../schemaUtils';

export const PasswordPolicyOptionsSchema = z
  .object({
    doNotAllowUsername: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_PASSWORD_POLICY_DO_NOT_ALLOW_USERNAME',
      help: 'Reject passwords that contain the username as a substring.',
    }),
    maxPasswordAge: option(
      z.number().min(0, 'passwordPolicy.maxPasswordAge must be a non-negative number').optional(),
      {
        env: 'PARSE_SERVER_PASSWORD_POLICY_MAX_PASSWORD_AGE',
        help: 'Maximum number of days a password remains valid before the user must change it.',
      }
    ),
    maxPasswordHistory: option(
      z.number()
        .int()
        .min(0, 'passwordPolicy.maxPasswordHistory must be >= 0')
        .max(20, 'passwordPolicy.maxPasswordHistory must be <= 20')
        .optional(),
      {
        env: 'PARSE_SERVER_PASSWORD_POLICY_MAX_PASSWORD_HISTORY',
        help: 'Number of previous passwords to remember; prevents reuse of recent passwords.',
      }
    ),
    resetPasswordSuccessOnInvalidEmail: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_PASSWORD_POLICY_RESET_PASSWORD_SUCCESS_ON_INVALID_EMAIL',
      help: 'Return a success response for password reset requests even if the email is not found, to prevent user enumeration.',
    }),
    resetTokenReuseIfValid: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_PASSWORD_POLICY_RESET_TOKEN_REUSE_IF_VALID',
      help: 'Reuse an existing password reset token if it is still valid, instead of generating a new one.',
    }),
    resetTokenValidityDuration: option(
      z.number().min(1, 'passwordPolicy.resetTokenValidityDuration must be a positive number').optional(),
      {
        env: 'PARSE_SERVER_PASSWORD_POLICY_RESET_TOKEN_VALIDITY_DURATION',
        help: 'Duration in seconds that a password reset token remains valid.',
      }
    ),
    validationError: option(z.string().optional(), {
      env: 'PARSE_SERVER_PASSWORD_POLICY_VALIDATION_ERROR',
      help: 'Custom error message shown to users when their password fails validation.',
    }),
    validatorCallback: option(z.custom<Function>(v => typeof v === 'function').optional(), {
      env: 'PARSE_SERVER_PASSWORD_POLICY_VALIDATOR_CALLBACK',
      help: 'Custom function to validate passwords programmatically, receives the password as input.',
    }),
    validatorPattern: option(z.union([z.string(), z.instanceof(RegExp)]).optional(), {
      env: 'PARSE_SERVER_PASSWORD_POLICY_VALIDATOR_PATTERN',
      help: 'Regular expression pattern that passwords must match to be accepted.',
    }),
  })
  .refine(
    data => !data.resetTokenReuseIfValid || data.resetTokenValidityDuration,
    { message: 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration' }
  )
  .loose();

export type PasswordPolicyOptions = z.infer<typeof PasswordPolicyOptionsSchema>;
