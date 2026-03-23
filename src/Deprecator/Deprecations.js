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
  {
    optionKey: 'requestComplexity.includeDepth',
    changeNewDefault: '10',
    solution: "Set 'requestComplexity.includeDepth' to a positive integer appropriate for your app to limit include pointer chain depth, or to '-1' to disable.",
  },
  {
    optionKey: 'requestComplexity.includeCount',
    changeNewDefault: '100',
    solution: "Set 'requestComplexity.includeCount' to a positive integer appropriate for your app to limit the number of include paths per query, or to '-1' to disable.",
  },
  {
    optionKey: 'requestComplexity.subqueryDepth',
    changeNewDefault: '10',
    solution: "Set 'requestComplexity.subqueryDepth' to a positive integer appropriate for your app to limit subquery nesting depth, or to '-1' to disable.",
  },
  {
    optionKey: 'requestComplexity.queryDepth',
    changeNewDefault: '10',
    solution: "Set 'requestComplexity.queryDepth' to a positive integer appropriate for your app to limit query condition nesting depth, or to '-1' to disable.",
  },
  {
    optionKey: 'requestComplexity.graphQLDepth',
    changeNewDefault: '20',
    solution: "Set 'requestComplexity.graphQLDepth' to a positive integer appropriate for your app to limit GraphQL field selection depth, or to '-1' to disable.",
  },
  {
    optionKey: 'requestComplexity.graphQLFields',
    changeNewDefault: '200',
    solution: "Set 'requestComplexity.graphQLFields' to a positive integer appropriate for your app to limit the number of GraphQL field selections, or to '-1' to disable.",
  },
  {
    optionKey: 'requestComplexity.batchRequestLimit',
    changeNewDefault: '100',
    solution: "Set 'requestComplexity.batchRequestLimit' to a positive integer appropriate for your app to limit the number of sub-requests per batch request, or to '-1' to disable.",
  },
  {
    optionKey: 'enableProductPurchaseLegacyApi',
    changeNewKey: '',
    solution: "The product purchase API is an undocumented, unmaintained legacy feature that may not function as expected and will be removed in a future major version. We strongly advise against using it. Set 'enableProductPurchaseLegacyApi' to 'false' to disable it, or remove the option to accept the future removal.",
  },
  {
    optionKey: 'allowExpiredAuthDataToken',
    changeNewKey: '',
    solution: "Auth providers are always validated on login regardless of this setting. Set 'allowExpiredAuthDataToken' to 'false' or remove the option to accept the future removal.",
  },
  {
    optionKey: 'protectedFieldsOwnerExempt',
    changeNewDefault: 'false',
    solution: "Set 'protectedFieldsOwnerExempt' to 'false' to apply protectedFields consistently to the user's own _User object (same as all other classes), or to 'true' to keep the current behavior where a user can see all their own fields.",
  },
  {
    optionKey: 'protectedFieldsTriggerExempt',
    changeNewDefault: 'true',
    solution: "Set 'protectedFieldsTriggerExempt' to 'true' to make Cloud Code triggers (e.g. beforeSave, afterSave) receive the full object including protected fields, or to 'false' to keep the current behavior where protected fields are stripped from trigger objects.",
  },
];
