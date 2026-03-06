/**
 * The deprecations.
 *
 * Add deprecations to the array using the following keys:
 * - `optionKey` {String}: The option key incl. its path, e.g. `security.enableCheck`.
 * - `envKey` {String}: The environment key, e.g. `PARSE_SERVER_SECURITY`.
 * - `changeNewKey` {String}: Set the new key name if the current key will be replaced,
 * or set to an empty string if the current key will be removed without replacement.
 * - `changeNewDefault` {String}: Set the new default value if the key's default value
 * will change in a future version.
 * - `solution`: The instruction to resolve this deprecation warning. Optional. This
 * instruction must not include the deprecation warning which is auto-generated.
 * It should only contain additional instruction regarding the deprecation if
 * necessary.
 *
 * If there are no deprecations, this must return an empty array.
 */
module.exports = [
  {
    optionKey: 'fileUpload.allowedFileUrlDomains',
    changeNewDefault: '[]',
    solution: "Set 'fileUpload.allowedFileUrlDomains' to the domains you want to allow, or to '[]' to block all file URLs.",
  },
  {
    optionKey: 'pages.encodePageParamHeaders',
    changeNewDefault: 'true',
    solution: "Set 'pages.encodePageParamHeaders' to 'true' to URI-encode non-ASCII characters in page parameter headers.",
  },
  {
    optionKey: 'readOnlyMasterKeyIps',
    changeNewDefault: '["127.0.0.1", "::1"]',
    solution: "Set 'readOnlyMasterKeyIps' to the IP addresses that should be allowed to use the read-only master key, or to '[\"127.0.0.1\", \"::1\"]' to restrict access to localhost.",
  },
  {
    optionKey: 'mountPlayground',
    changeNewKey: '',
    solution: "Use Parse Dashboard as GraphQL IDE or configure a third-party GraphQL client such as Apollo Sandbox, GraphiQL, or Insomnia with custom request headers.",
  },
  {
    optionKey: 'playgroundPath',
    changeNewKey: '',
    solution: "Use Parse Dashboard as GraphQL IDE or configure a third-party GraphQL client such as Apollo Sandbox, GraphiQL, or Insomnia with custom request headers.",
  },
];
