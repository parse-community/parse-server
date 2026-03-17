import { z } from 'zod';
import { option } from '../schemaUtils';

export const PagesRouteSchema = z
  .object({
    handler: option(z.function(), {
      help: 'The Express route handler function for this custom page route.',
    }),
    method: option(z.string(), {
      env: 'PARSE_SERVER_PAGES_ROUTE_METHOD',
      help: "The HTTP method for this custom page route (e.g. 'GET', 'POST').",
    }),
    path: option(z.string(), {
      env: 'PARSE_SERVER_PAGES_ROUTE_PATH',
      help: 'The URL path for this custom page route.',
    }),
  })
  .loose();

export type PagesRoute = z.infer<typeof PagesRouteSchema>;

export const PagesCustomUrlsOptionsSchema = z
  .object({
    emailVerificationLinkExpired: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_LINK_EXPIRED',
      help: 'Redirect URL shown when a user clicks an expired email verification link.',
    }),
    emailVerificationLinkInvalid: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_LINK_INVALID',
      help: 'Redirect URL shown when a user clicks an invalid email verification link.',
    }),
    emailVerificationSendFail: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_SEND_FAIL',
      help: 'Redirect URL shown when sending the email verification email fails.',
    }),
    emailVerificationSendSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_SEND_SUCCESS',
      help: 'Redirect URL shown when a re-send verification email request succeeds.',
    }),
    emailVerificationSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_EMAIL_VERIFICATION_SUCCESS',
      help: 'Redirect URL shown after successful email verification.',
    }),
    passwordReset: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_PASSWORD_RESET',
      help: 'URL of the custom password reset form page.',
    }),
    passwordResetLinkInvalid: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_PASSWORD_RESET_LINK_INVALID',
      help: 'Redirect URL shown when a user clicks an invalid password reset link.',
    }),
    passwordResetSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URL_PASSWORD_RESET_SUCCESS',
      help: 'Redirect URL shown after a successful password reset.',
    }),
  })
  .loose();

export type PagesCustomUrlsOptions = z.infer<typeof PagesCustomUrlsOptionsSchema>;

export const PagesOptionsSchema = z
  .object({
    customRoutes: option(z.array(PagesRouteSchema).default([]), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_ROUTES',
      help: 'Array of custom Express routes to add to the pages router.',
    }),
    customUrls: option(PagesCustomUrlsOptionsSchema.default({}), {
      env: 'PARSE_SERVER_PAGES_CUSTOM_URLS',
      help: 'Custom redirect URLs for email verification and password reset page flows.',
    }),
    enableLocalization: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_PAGES_ENABLE_LOCALIZATION',
      help: "Enable localized page templates based on the user's locale.",
    }),
    encodePageParamHeaders: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_PAGES_ENCODE_PAGE_PARAM_HEADERS',
      help: 'Encode page parameters in HTTP headers for custom page routing.',
    }),
    forceRedirect: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_PAGES_FORCE_REDIRECT',
      help: 'Always redirect to custom URLs instead of rendering built-in pages.',
    }),
    localizationFallbackLocale: option(z.string().default('en'), {
      env: 'PARSE_SERVER_PAGES_LOCALIZATION_FALLBACK_LOCALE',
      help: "Default locale used when the user's locale is not available.",
    }),
    localizationJsonPath: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_LOCALIZATION_JSON_PATH',
      help: 'Path to the directory containing localization JSON files.',
    }),
    pagesEndpoint: option(z.string().default('apps'), {
      env: 'PARSE_SERVER_PAGES_PAGES_ENDPOINT',
      help: 'The URL path prefix for all server-rendered pages.',
    }),
    pagesPath: option(z.string().optional(), {
      env: 'PARSE_SERVER_PAGES_PAGES_PATH',
      help: 'Path to the directory containing custom page templates.',
    }),
    placeholders: option(z.record(z.string(), z.any()).default({}), {
      env: 'PARSE_SERVER_PAGES_PLACEHOLDERS',
      help: 'Key-value pairs for template variable substitution in page templates.',
    }),
  })
  .loose();

export type PagesOptions = z.infer<typeof PagesOptionsSchema>;

export const CustomPagesOptionsSchema = z
  .object({
    choosePassword: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_CHOOSE_PASSWORD',
      help: 'URL of the custom page where users choose a new password.',
    }),
    expiredVerificationLink: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_EXPIRED_VERIFICATION_LINK',
      help: 'URL of the custom page shown when an email verification link has expired.',
    }),
    invalidLink: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_INVALID_LINK',
      help: 'URL of the custom page shown for any invalid link.',
    }),
    invalidPasswordResetLink: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_INVALID_PASSWORD_RESET_LINK',
      help: 'URL of the custom page shown when a password reset link is invalid.',
    }),
    invalidVerificationLink: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_INVALID_VERIFICATION_LINK',
      help: 'URL of the custom page shown when an email verification link is invalid.',
    }),
    linkSendFail: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_LINK_SEND_FAIL',
      help: 'URL of the custom page shown when sending a verification or reset email fails.',
    }),
    linkSendSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_LINK_SEND_SUCCESS',
      help: 'URL of the custom page shown when sending a verification or reset email succeeds.',
    }),
    parseFrameURL: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_PARSE_FRAME_URL',
      help: 'URL loaded in an iframe on built-in pages, used for Parse Dashboard integration.',
    }),
    passwordResetSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_PASSWORD_RESET_SUCCESS',
      help: 'URL of the custom page shown after a successful password reset.',
    }),
    verifyEmailSuccess: option(z.string().optional(), {
      env: 'PARSE_SERVER_CUSTOM_PAGES_VERIFY_EMAIL_SUCCESS',
      help: 'URL of the custom page shown after successful email verification.',
    }),
  })
  .loose();

export type CustomPagesOptions = z.infer<typeof CustomPagesOptionsSchema>;
