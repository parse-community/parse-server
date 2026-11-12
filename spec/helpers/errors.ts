// Parse error codes used by the REST specs. Mirrors Parse.Error so specs can
// assert on response `code` values without importing the Parse JS SDK.
export const ParseError = {
  INTERNAL_SERVER_ERROR: 1,
  INVALID_JSON: 107,
  INCORRECT_TYPE: 111,
} as const;
