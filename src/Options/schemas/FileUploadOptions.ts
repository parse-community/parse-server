import { z } from 'zod';
import { option } from '../schemaUtils';

export const FileUploadOptionsSchema = z
  .object({
    allowedFileUrlDomains: option(z.array(z.string()).default(['*']), {
      env: 'PARSE_SERVER_FILE_UPLOAD_ALLOWED_FILE_URL_DOMAINS',
      help: "Domains from which file URLs are accepted for upload. Use ['*'] to allow all domains.",
    }),
    enableForAnonymousUser: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_FILE_UPLOAD_ENABLE_FOR_ANONYMOUS_USER',
      help: 'Allow anonymous users to upload files.',
    }),
    enableForAuthenticatedUser: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_FILE_UPLOAD_ENABLE_FOR_AUTHENTICATED_USER',
      help: 'Allow authenticated users to upload files.',
    }),
    enableForPublic: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_FILE_UPLOAD_ENABLE_FOR_PUBLIC',
      help: 'Allow unauthenticated public requests to upload files.',
    }),
    fileExtensions: option(
      z.array(z.string()).default([
        '^(?!([xXsS]?[hH][tT][mM][lL]?(\\\\+[xX][mM][lL])?|[xX][hH][tT]|[sS][vV][gG]([zZ]|\\\\+[xX][mM][lL])?|[xX][mM][lL]|[xX][sS][lL][tT]?(\\\\+[xX][mM][lL])?|[xX][sS][dD]|[rR][nN][gG]|[rR][dD][fF](\\\\+[xX][mM][lL])?|[oO][wW][lL]|[mM][aA][tT][hH][mM][lL](\\\\+[xX][mM][lL])?)$)',
      ]),
      {
        env: 'PARSE_SERVER_FILE_UPLOAD_FILE_EXTENSIONS',
        help: 'Regex patterns for allowed file extensions. Files with extensions matching any pattern are accepted.',
      }
    ),
  })
  .loose();

export type FileUploadOptions = z.infer<typeof FileUploadOptionsSchema>;
