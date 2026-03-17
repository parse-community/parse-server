import { z } from 'zod';
import { option } from '../schemaUtils';

export const AccountLockoutOptionsSchema = z
  .object({
    duration: option(
      z.number()
        .min(1, 'Account lockout duration should be greater than 0')
        .max(99999, 'Account lockout duration should be less than 100000')
        .optional(),
      {
        env: 'PARSE_SERVER_ACCOUNT_LOCKOUT_DURATION',
        help: 'Number of minutes the account remains locked after reaching the failed login threshold.',
      }
    ),
    threshold: option(
      z.number()
        .int('Account lockout threshold should be an integer')
        .min(1, 'Account lockout threshold should be greater than 0')
        .max(999, 'Account lockout threshold should be less than 1000')
        .optional(),
      {
        env: 'PARSE_SERVER_ACCOUNT_LOCKOUT_THRESHOLD',
        help: 'Number of failed login attempts before the account is temporarily locked.',
      }
    ),
    unlockOnPasswordReset: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_ACCOUNT_LOCKOUT_UNLOCK_ON_PASSWORD_RESET',
      help: 'Automatically unlock a locked account when the user successfully resets their password.',
    }),
  })
  .loose();

export type AccountLockoutOptions = z.infer<typeof AccountLockoutOptionsSchema>;
