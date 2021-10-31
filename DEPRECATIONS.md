# Deprecation Plan <!-- omit in toc -->

The following is a list of deprecations, according to the [Deprecation Policy](https://github.com/parse-community/parse-server/blob/master/CONTRIBUTING.md#deprecation-policy). After a feature becomes deprecated, and giving developers time to adapt to the change, the deprecated feature will eventually be removed, leading to a breaking change. Developer feedback during the deprecation period may postpone or even revoke the introduction of the breaking change.

| ID     | Change                                          | Issue                                                                | Deprecation [ℹ️][i_deprecation] | Planned Removal [ℹ️][i_removal] | Status [ℹ️][i_status] | Notes |
|--------|-------------------------------------------------|----------------------------------------------------------------------|---------------------------------|---------------------------------|-----------------------|-------|
| DEPPS1 | Native MongoDB syntax in aggregation pipeline   | [#7338](https://github.com/parse-community/parse-server/issues/7338) | 5.0.0 (2022)                    | 6.0.0 (2023)                    | deprecated            | -     |
| DEPPS2 | Config option `directAccess` defaults to `true` | [#6636](https://github.com/parse-community/parse-server/pull/6636)   | 5.0.0 (2022)                    | 6.0.0 (2023)                    | deprecated            | -     |
| DEPPS3 | Config option `enforcePrivateUsers` defaults to `true` | [#7319](https://github.com/parse-community/parse-server/pull/7319)   | 5.0.0 (2022)                    | 6.0.0 (2023)                    | deprecated            | -     |
| DEPPS4 | Remove convenience method for http request `Parse.Cloud.httpRequest` | [#7589](https://github.com/parse-community/parse-server/pull/7589)   | 5.0.0 (2022)                    | 6.0.0 (2023)                    | deprecated            | -     |

[i_deprecation]: ## "The version and date of the deprecation."
[i_removal]: ## "The version and date of the planned removal."
[i_status]: ## "The current status of the deprecation: deprecated (the feature is deprecated and still available), removed (the deprecated feature has been removed and is unavailable), retracted (the deprecation has been retracted and the feature will not be removed."
