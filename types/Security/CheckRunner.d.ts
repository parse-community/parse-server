export = CheckRunner;
/**
 * @module SecurityCheck
 */
/**
 * The security check runner.
 */
declare class CheckRunner {
    /**
     * The security check runner.
     * @param {Object} [config] The configuration options.
     * @param {Boolean} [config.enableCheck=false] Is true if Parse Server should report weak security settings.
     * @param {Boolean} [config.enableCheckLog=false] Is true if the security check report should be written to logs.
     * @param {Object} [config.checkGroups] The check groups to run. Default are the groups defined in `./CheckGroups/CheckGroups.js`.
     */
    constructor(config?: {
        enableCheck?: boolean;
        enableCheckLog?: boolean;
        checkGroups?: any;
    });
    enableCheck: boolean;
    enableCheckLog: boolean;
    checkGroups: any;
    /**
     * Runs all security checks and returns the results.
     * @params
     * @returns {Object} The security check report.
     */
    run({ version }?: {
        version?: string;
    }): any;
    /**
     * Generates a security check report in JSON format with schema:
     * ```
     * {
     *    report: {
     *      version: "1.0.0", // The report version, defines the schema
     *      state: "fail"     // The disjunctive indicator of failed checks in all groups.
     *      groups: [         // The check groups
     *        {
     *          name: "House",            // The group name
     *          state: "fail"             // The disjunctive indicator of failed checks in this group.
     *          checks: [                 // The checks
     *            title: "Door locked",   // The check title
     *            state: "fail"           // The check state
     *            warning: "Anyone can enter your house."   // The warning.
     *            solution: "Lock your door."               // The solution.
     *          ]
     *        },
     *        ...
     *      ]
     *    }
     * }
     * ```
     * @param {Object} params The parameters.
     * @param {Array<CheckGroup>} params.groups The check groups.
     * @param {String} params.version: The report schema version.
     * @returns {Object} The report.
     */
    _generateReport({ groups, version }: {
        groups: Array<any>;
        version: string;
    }): any;
    /**
     * Logs the security check report.
     * @param {Object} report The report to log.
     */
    _logReport(report: any): void;
    /**
     * Returns an icon for use in the report log output.
     * @param {CheckState} state The check state.
     * @returns {String} The icon.
     */
    _getLogIconForState(state: any): string;
    /**
     * Validates the constructor parameters.
     * @param {Object} params The parameters to validate.
     */
    _validateParams(params: any): void;
}
