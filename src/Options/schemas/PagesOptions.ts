import { z } from 'zod';
import { option } from '../schemaUtils';

export const PagesRouteSchema = z
  .object({
    handler: option(z.any(), {
      env: 'PARSE_SERVER_PAGES_ROUTE_HANDLER',
      help: 'The route handler function.',
    }),
    method: option(z.string(), {
      env: 'PARSE_SERVER_PAGES_ROUTE_METHOD',
      help: 'The HTTP method for the route.',
    }),
    path: option(z.string(), {
      env: 'PARSE_SERVER_PAGES_ROUTE_PATH',
      help: 'The path for the route.',
    }),
  })
  .loose();

export type PagesRoute = z.infer<typeof PagesRouteSchema>;

export const PagesCustomUrlsOptionsSchema = z
  .object({
    emailVerificationLinkExpired: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_LINK_EXPIRED',
      help: 'Custom URL for expired email verification link.',
    }),
    emailVerificationLinkInvalid: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_LINK_INVALID',
      help: 'Custom URL for invalid email verification link.',
    }),
    emailVerificationSendFail: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_SEND_FAIL',
      help: 'Custom URL for email verification send failure.',
    }),
    emailVerificationSendSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_SEND_SUCCESS',
      help: 'Custom URL for email verification send success.',
    }),
    emailVerificationSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_SUCCESS',
      help: 'Custom URL for email verification success.',
    }),
    passwordReset: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_PASSWORD_RESET',
      help: 'Custom URL for password reset.',
    }),
    passwordResetLinkInvalid: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_PASSWORD_RESET_LINK_INVALID',
      help: 'Custom URL for invalid password reset link.',
    }),
    passwordResetSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_PASSWORD_RESET_SUCCESS',
      help: 'Custom URL for password reset success.',
    }),
  })
  .loose();

export type PagesCustomUrlsOptions = z.infer<typeof PagesCustomUrlsOptionsSchema>;

export const PagesOptionsSchema = z
  .object({
    customRoutes: option(z.array(PagesRouteSchema).default([]), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_ROUTES',
      help: 'Custom routes for pages.',
    }),
    customUrls: option(PagesCustomUrlsOptionsSchema.default({}), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URLS',
      help: 'Custom URLs for pages.',
    }),
    enableLocalization: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_PAGES_ENABLE_LOCALIZATION',
      help: 'Enable localization for pages.',
    }),
    encodePageParamHeaders: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_PAGES_ENCODE_PAGE_PARAM_HEADERS',
      help: 'Encode page parameters in headers.',
    }),
    forceRedirect: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_PAGES_FORCE_REDIRECT',
      help: 'Force redirect for pages.',
    }),
    localizationFallbackLocale: option(z.string().default('en'), {
      env: 'PARSE_SERVER_PAGES_LOCALIZATION_FALLBACK_LOCALE',
      help: 'Fallback locale for localization.',
    }),
    localizationJsonPath: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_LOCALIZATION_JSON_PATH',
      help: 'Path to localization JSON files.',
    }),
    pagesEndpoint: option(z.string().default('apps'), {
      env: 'PARSE_SERVER_PAGES_PAGES_ENDPOINT',
      help: 'The pages endpoint.',
    }),
    pagesPath: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_PAGES_PATH',
      help: 'Path to pages directory.',
    }),
    placeholders: option(z.record(z.string(), z.any()).default({}), {
      env: 'PARSE_SERVER_PAGES_PLACEHOLDERS',
      help: 'Placeholders for page templates.',
    }),
  })
  .loose();

export type PagesOptions = z.infer<typeof PagesOptionsSchema>;

export const CustomPagesOptionsSchema = z
  .object({
    choosePassword: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_CHOOSE_PASSWORD',
      help: 'Custom page URL for choosing a password.',
    }),
    expiredVerificationLink: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_EXPIRED_VERIFICATION_LINK',
      help: 'Custom page URL for expired verification link.',
    }),
    invalidLink: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_INVALID_LINK',
      help: 'Custom page URL for invalid link.',
    }),
    invalidPasswordResetLink: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_INVALID_PASSWORD_RESET_LINK',
      help: 'Custom page URL for invalid password reset link.',
    }),
    invalidVerificationLink: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_INVALID_VERIFICATION_LINK',
      help: 'Custom page URL for invalid verification link.',
    }),
    linkSendFail: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_LINK_SEND_FAIL',
      help: 'Custom page URL for link send failure.',
    }),
    linkSendSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_LINK_SEND_SUCCESS',
      help: 'Custom page URL for link send success.',
    }),
    parseFrameURL: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_PARSE_FRAME_URL',
      help: 'URL for the Parse frame.',
    }),
    passwordResetSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_PASSWORD_RESET_SUCCESS',
      help: 'Custom page URL for password reset success.',
    }),
    verifyEmailSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_VERIFY_EMAIL_SUCCESS',
      help: 'Custom page URL for email verification success.',
    }),
  })
  .loose();

export type CustomPagesOptions = z.infer<typeof CustomPagesOptionsSchema>;
