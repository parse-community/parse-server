export var __esModule: boolean;
export default _default;
declare var _default: typeof Check;
/**
 * @module SecurityCheck
 */
/**
 * A security check.
 * @class Check
 */
export class Check {
    /**
     * Constructs a new security check.
     * @param {Object} params The parameters.
     * @param {String} params.title The title.
     * @param {String} params.warning The warning message if the check fails.
     * @param {String} params.solution The solution to fix the check.
     * @param {Promise} params.check The check as synchronous or asynchronous function.
     */
    constructor(params: {
        title: string;
        warning: string;
        solution: string;
        check: Promise<any>;
    });
    title: string;
    warning: string;
    solution: string;
    check: Promise<any>;
    _checkState: string;
    /**
     * Returns the current check state.
     * @return {CheckState} The check state.
     */
    checkState(): Readonly<{
        none: string;
        fail: string;
        success: string;
    }>;
    run(): Promise<void>;
    stateFailError: any;
    /**
     * Validates the constructor parameters.
     * @param {Object} params The parameters to validate.
     */
    _validateParams(params: any): void;
}
/**
 * The check state.
 */
export const CheckState: Readonly<{
    none: string;
    fail: string;
    success: string;
}>;
