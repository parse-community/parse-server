# Deprecation Plan <!-- omit in toc -->

The following is a list of deprecations, according to the [Deprecation Policy](https://github.com/parse-community/parse-server/blob/master/CONTRIBUTING.md#deprecation-policy). After a feature becomes deprecated, and giving developers time to adapt to the change, the deprecated feature will eventually be removed, leading to a breaking change. Developer feedback during the deprecation period may postpone or even revoke the introduction of the breaking change.

| ID     | Change                                          | Issue                                                                | Deprecation [ℹ️][i_deprecation] | Planned Removal [ℹ️][i_removal] | Status [ℹ️][i_status] | Notes |
|--------|-------------------------------------------------|----------------------------------------------------------------------|---------------------------------|---------------------------------|-----------------------|-------|
| DEPPS1 | Native MongoDB syntax in aggregation pipeline   | [#7338](https://github.com/parse-community/parse-server/issues/7338) | 5.0.0 (2022)                    | 6.0.0 (2023)                    | removed            | -     |
| DEPPS2 | Config option `directAccess` defaults to `true` | [#6636](https://github.com/parse-community/parse-server/pull/6636)   | 5.0.0 (2022)                    | 6.0.0 (2023)                    | removed            | -     |
| DEPPS3 | Config option `enforcePrivateUsers` defaults to `true` | [#7319](https://github.com/parse-community/parse-server/pull/7319)   | 5.0.0 (2022)                    | 6.0.0 (2023)                    | removed            | -     |
| DEPPS4 | Remove convenience method for http request `Parse.Cloud.httpRequest` | [#7589](https://github.com/parse-community/parse-server/pull/7589)   | 5.0.0 (2022)                    | 6.0.0 (2023)                    | removed            | -     |
| DEPPS5 | Config option `allowClientClassCreation` defaults to `false` | [#7925](https://github.com/parse-community/parse-server/pull/7925)   | 5.3.0 (2022)                    | 7.0.0 (2024)                    | deprecated            | -     |
| DEPPS6 | Auth providers disabled by default | [#7953](https://github.com/parse-community/parse-server/pull/7953)   | 5.3.0 (2022)                    | 7.0.0 (2024)                    | deprecated            | -     |
| DEPPS7 | Remove file trigger syntax `Parse.Cloud.beforeSaveFile((request) => {})` | [#7966](https://github.com/parse-community/parse-server/pull/7966)   | 5.3.0 (2022)                    | 7.0.0 (2024)                    | deprecated            | -     |
| DEPPS8 | Login with expired 3rd party authentication token defaults to `false` | [#7079](https://github.com/parse-community/parse-server/pull/7079)   | 5.3.0 (2022)                    | 7.0.0 (2024)                    | deprecated            | -     |
| DEPPS9 | Rename LiveQuery `fields` option to `keys` | [#8389](https://github.com/parse-community/parse-server/issues/8389)   | 6.0.0 (2023)                    | 7.0.0 (2024)                    | deprecated            | -     |
| DEPPS10 | Config option `encodeParseObjectInCloudFunction` defaults to `true`  | [#8634](https://github.com/parse-community/parse-server/issues/8634)   | 6.2.0 (2023)                    | 8.0.0 (2025)                    | deprecated            | -     |

[i_deprecation]: ## "The version and date of the deprecation."
[i_removal]: ## "The version and date of the planned removal."
[i_status]: ## "The current status of the deprecation: deprecated (the feature is deprecated and still available), removed (the deprecated feature has been removed and is unavailable), retracted (the deprecation has been retracted and the feature will not be removed."
